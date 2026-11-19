import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { hash, hashSync, verify } from "@node-rs/argon2";
import { Router, type CookieOptions, type Request, type RequestHandler, type Response } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import type { Config } from "../../config.js";
import { HttpError } from "../../errors.js";
import { profileDisplayName, profilePhone } from "../profile/fields.js";
import { accountEmail, currentPassword, newPassword, passwordOptions, passwordValidationError, rejectCredentialRate, withPasswordWork } from "./credentials.js";
import { AttemptWindow } from "./throttle.js";

interface User {
  id: string;
  email: string;
  role: "user" | "admin";
}

interface AuthContext {
  user: User;
  csrfToken: string;
  tokenHash: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

interface Credentials {
  email: string;
  password: string;
}

interface PasswordAccount extends User {
  passwordHash: string;
}

const registration = z.strictObject({
  email: accountEmail,
  password: newPassword,
  phone: profilePhone.optional(),
  displayName: profileDisplayName.optional(),
});
const login = z.strictObject({ email: accountEmail, password: currentPassword });
const sessionDurationMs = 7 * 24 * 60 * 60_000;
const cookieName = "plantcare_session";
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

function readSessionToken(req: Request): string | undefined {
  for (const cookie of (req.get("Cookie") ?? "").split(";")) {
    const [name, token] = cookie.trim().split("=");
    if (name === cookieName && token && tokenPattern.test(token)) return token;
  }
  return undefined;
}

function tokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function rejectCredentials(): never {
  throw new HttpError(401, "INVALID_CREDENTIALS", "Email hoặc mật khẩu không đúng.");
}

function requireAuth(req: Request): AuthContext {
  if (!req.auth) throw new HttpError(401, "AUTH_REQUIRED", "Bạn cần đăng nhập.");
  return req.auth;
}

export function createAuth(pool: Pool, config: Config) {
  const router = Router();
  const cookie: CookieOptions = { httpOnly: true, secure: config.cookieSecure, sameSite: "lax", path: "/" };
  const ipAttempts = new AttemptWindow(40);
  const accountAttempts = new AttemptWindow(8);
  const dummyPasswordHash = hashSync(randomBytes(32).toString("base64url"), passwordOptions);

  function signToken(purpose: "csrf" | "rate", input: string): string {
    return createHmac("sha256", config.csrfSecret).update(`${purpose}:${input}`).digest("base64url");
  }

  function withCredentials<T extends Credentials>(
    schema: z.ZodType<T>,
    handler: (req: Request, res: Response, data: T) => Promise<void>,
  ): RequestHandler {
    return async (req, res) => {
      const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
      const ipWait = ipAttempts.retryAfter(signToken("rate", `ip:${ip}`));
      if (ipWait > 0) rejectCredentialRate(res, ipWait);

      const credentials = schema.safeParse(req.body);
      if (!credentials.success) {
        throw passwordValidationError(credentials.error)
          ?? new HttpError(400, "INVALID_INPUT", "Kiểm tra email, mật khẩu và thông tin tùy chọn đã nhập.");
      }
      const accountWait = accountAttempts.retryAfter(signToken("rate", `email:${credentials.data.email}`));
      if (accountWait > 0) rejectCredentialRate(res, accountWait);

      await withPasswordWork(res, () => handler(req, res, credentials.data));
    };
  }

  const requireOrigin: RequestHandler = (req, _res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.get("Origin") !== config.appOrigin) {
      throw new HttpError(403, "ORIGIN_FORBIDDEN", "Nguồn gửi yêu cầu không hợp lệ.");
    }
    next();
  };

  const requireSession: RequestHandler = async (req, _res, next) => {
    const token = readSessionToken(req);
    if (!token) throw new HttpError(401, "AUTH_REQUIRED", "Bạn cần đăng nhập.");

    const tokenHash = tokenDigest(token);
    const result = await pool.query<User>(
      `SELECT a.id, a.email, a.vai_tro AS role
       FROM sessions AS s
       JOIN accounts AS a ON a.id = s.tai_khoan_id
       WHERE s.token_bam = $1
         AND s.thu_hoi_luc IS NULL
         AND s.het_han_luc > now()
         AND a.yeu_cau_xoa_luc IS NULL`,
      [tokenHash],
    );
    const user = result.rows[0];
    if (!user) throw new HttpError(401, "AUTH_REQUIRED", "Bạn cần đăng nhập.");

    req.auth = { user, tokenHash, csrfToken: signToken("csrf", token) };
    next();
  };

  const requireCsrf: RequestHandler = (req, _res, next) => {
    const { csrfToken } = requireAuth(req);
    const supplied = req.get("X-CSRF-Token");
    if (!supplied || !tokenPattern.test(supplied) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(csrfToken))) {
      throw new HttpError(403, "CSRF_INVALID", "Phiên thao tác không hợp lệ. Vui lòng tải lại trang.");
    }
    next();
  };

  router.post("/register", withCredentials(registration, async (_req, res, data) => {
    const passwordHash = await hash(data.password, passwordOptions);
    await pool.query(
      `WITH created AS (
         INSERT INTO accounts (email, mat_khau_bam) VALUES ($1, $2)
         ON CONFLICT (email) DO NOTHING RETURNING id
       )
       INSERT INTO account_profiles (tai_khoan_id, so_dien_thoai, ten_hien_thi)
       SELECT id, $3::text, $4::text FROM created WHERE $3::text IS NOT NULL OR $4::text IS NOT NULL`,
      [data.email, passwordHash, data.phone ?? null, data.displayName ?? null],
    );
    res.json({ message: "Nếu thông tin hợp lệ, bạn có thể đăng nhập bằng email và mật khẩu vừa nhập." });
  }));

  router.post("/login", withCredentials(login, async (req, res, data) => {
    const result = await pool.query<PasswordAccount>(
      `SELECT id, email, vai_tro AS role, mat_khau_bam AS "passwordHash"
       FROM accounts WHERE email = $1 AND yeu_cau_xoa_luc IS NULL`,
      [data.email],
    );
    const account = result.rows[0];
    const valid = await verify(account?.passwordHash ?? dummyPasswordHash, data.password);
    if (!account || !valid) rejectCredentials();

    const token = randomBytes(32).toString("base64url");
    const oldToken = readSessionToken(req);
    const session = await pool.query<{ id: string }>(
      `WITH verified_account AS (
         SELECT id FROM accounts
         WHERE id = $1 AND mat_khau_bam = $4 AND email = $6 AND yeu_cau_xoa_luc IS NULL
         FOR SHARE
       ), new_session AS (
         INSERT INTO sessions (tai_khoan_id, token_bam, het_han_luc)
         SELECT id, $2, $3 FROM verified_account
         RETURNING id
       ), revoked AS (
         UPDATE sessions SET thu_hoi_luc = now()
         WHERE token_bam = $5 AND thu_hoi_luc IS NULL AND EXISTS (SELECT 1 FROM new_session)
       )
       SELECT id FROM new_session`,
      [account.id, tokenDigest(token), new Date(Date.now() + sessionDurationMs), account.passwordHash,
        oldToken ? tokenDigest(oldToken) : null, account.email],
    );
    if (!session.rows[0]) rejectCredentials();

    res.cookie(cookieName, token, { ...cookie, maxAge: sessionDurationMs });
    const { id, email: accountEmail, role } = account;
    res.json({ user: { id, email: accountEmail, role }, csrfToken: signToken("csrf", token) });
  }));

  router.get("/me", requireSession, (req, res) => {
    const { user, csrfToken } = requireAuth(req);
    res.json({ user, csrfToken });
  });

  router.post("/logout", requireSession, requireCsrf, async (req, res) => {
    const { tokenHash } = requireAuth(req);
    await pool.query("UPDATE sessions SET thu_hoi_luc = now() WHERE token_bam = $1 AND thu_hoi_luc IS NULL", [tokenHash]);
    res.clearCookie(cookieName, cookie);
    res.status(204).end();
  });

  return { router, requireOrigin, requireSession, requireCsrf };
}
