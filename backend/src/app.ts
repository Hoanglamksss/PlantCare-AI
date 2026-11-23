import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import express, { type Express } from "express";
import helmet from "helmet";
import type { Pool } from "pg";
import type { Config } from "./config.js";
import { HttpError, errorHandler } from "./errors.js";
import { createEmailVerificationRouter } from "./modules/auth/email-verification.js";
import { createAuth } from "./modules/auth/router.js";
import { createAdminRouter } from "./modules/admin/router.js";
import { createChatRouter } from "./modules/chat/router.js";
import { createCommunityRouter } from "./modules/community/router.js";
import { createDiagnosisRouter } from "./modules/diagnosis/router.js";
import { createJournalRouter } from "./modules/journal/router.js";
import { configuredPhotoServices } from "./modules/media/services.js";
import { PhotoUploadSlots } from "./modules/media/upload.js";
import { createPlantRouter } from "./modules/plants/router.js";
import { createProfileRouter } from "./modules/profile/router.js";
import { createScheduleRouter } from "./modules/schedules/router.js";
import { openapi } from "./openapi.js";

function mountSwagger(app: Express): void {
  const require = createRequire(import.meta.url);
  const stylesheet = require.resolve("swagger-ui-dist/swagger-ui.css");
  const bundle = require.resolve("swagger-ui-dist/swagger-ui-bundle.js");

  app.get("/openapi.json", (_req, res) => res.set("Cache-Control", "no-store").json(openapi));
  app.get("/docs/swagger-ui.css", (_req, res) => res.sendFile(stylesheet));
  app.get("/docs/swagger-ui-bundle.js", (_req, res) => res.sendFile(bundle));
  app.get("/docs/bootstrap.js", (_req, res) => {
    res.type("js").send(`SwaggerUIBundle({
      url: '/openapi.json', dom_id: '#swagger-ui', validatorUrl: null,
      deepLinking: true, withCredentials: true, persistAuthorization: false
    });`);
  });
  app.get("/docs", (_req, res) => {
    res.type("html").send(`<!doctype html>
      <html lang="vi"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>PlantCare AI API</title><link rel="stylesheet" href="/docs/swagger-ui.css">
      </head><body><div id="swagger-ui"></div>
      <script src="/docs/swagger-ui-bundle.js"></script>
      <script src="/docs/bootstrap.js"></script></body></html>`);
  });
}

export function createApp(config: Config, pool: Pool): Express {
  const app = express();
  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", 1);

  app.use((_req, res, next) => {
    const requestId = randomUUID();
    res.locals.requestId = requestId;
    res.set("X-Request-ID", requestId);
    next();
  });
  app.use(helmet({
    strictTransportSecurity: config.cookieSecure,
    contentSecurityPolicy: {
      directives: { upgradeInsecureRequests: config.cookieSecure ? [] : null },
    },
  }));
  app.use(["/api", "/health"], (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  app.get("/health/live", (_req, res) => res.json({ status: "ok" }));
  app.get("/health/ready", async (_req, res) => {
    const result = await pool.query<{ ready: boolean }>(
      `SELECT to_regclass('accounts') IS NOT NULL AND to_regclass('sessions') IS NOT NULL
         AND to_regclass('plant_species') IS NOT NULL AND to_regclass('user_plants') IS NOT NULL
         AND to_regclass('care_logs') IS NOT NULL AND to_regclass('diagnoses') IS NOT NULL
         AND to_regclass('care_log_photos') IS NOT NULL AND to_regclass('account_profiles') IS NOT NULL
         AND to_regclass('community_posts') IS NOT NULL AND to_regclass('care_schedules') IS NOT NULL
         AND to_regclass('notifications') IS NOT NULL
         AND to_regclass('chat_turns') IS NOT NULL AND to_regclass('email_verification_codes') IS NOT NULL
         AND to_regclass('account_email_challenges') IS NOT NULL
         AND (SELECT count(*) FROM pg_attribute WHERE attrelid = to_regclass('care_logs')
              AND NOT attisdropped AND attname IN ('tai_khoan_id', 'la_ghi_chu')) = 2
         AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('community_plant_posts')
              AND NOT attisdropped AND attname = 'chia_se_nhat_ky') AS ready`,
    );
    if (!result.rows[0]?.ready) {
      throw new HttpError(503, "DATABASE_NOT_READY", "Cơ sở dữ liệu chưa sẵn sàng.");
    }
    res.json({ status: "ok" });
  });

  const auth = createAuth(pool, config);
  const photoServices = configuredPhotoServices();
  const uploadSlots = new PhotoUploadSlots();
  app.use("/api/v1", auth.requireOrigin, express.json({ limit: "16kb", inflate: false }));
  app.use("/api/v1/auth", auth.router);
  app.use("/api/v1", createEmailVerificationRouter(pool, config.csrfSecret, auth.requireSession, auth.requireCsrf));
  app.use("/api/v1", createProfileRouter(pool, photoServices, auth.requireSession, auth.requireCsrf, uploadSlots, config.csrfSecret));
  app.use("/api/v1", createPlantRouter(pool, auth.requireSession, auth.requireCsrf));
  app.use("/api/v1", createCommunityRouter(pool, auth.requireSession, auth.requireCsrf, config.csrfSecret, photoServices, uploadSlots));
  app.use("/api/v1", createAdminRouter(pool, auth.requireSession, auth.requireCsrf));
  app.use("/api/v1", createScheduleRouter(pool, auth.requireSession, auth.requireCsrf));
  app.use("/api/v1", createDiagnosisRouter(pool, auth.requireSession, auth.requireCsrf, photoServices, uploadSlots));
  app.use("/api/v1", createJournalRouter(pool, photoServices, auth.requireSession, auth.requireCsrf, uploadSlots));
  app.use("/api/v1", createChatRouter(pool, auth.requireSession, auth.requireCsrf, Boolean(photoServices)));
  if (config.enableSwagger) mountSwagger(app);

  app.use((_req, _res, next) => next(new HttpError(404, "NOT_FOUND", "Không tìm thấy tài nguyên.")));
  app.use(errorHandler);
  return app;
}
