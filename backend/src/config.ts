export interface Config {
  databaseUrl: string;
  csrfSecret: string;
  appOrigin: string;
  host: string;
  port: number;
  trustProxy: boolean;
  enableSwagger: boolean;
  cookieSecure: boolean;
  dbPoolMax: number;
}

export class ConfigError extends Error {}

function positiveInteger(value: string | undefined, fallback: number, maximum: number, name: string): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > maximum) {
    throw new ConfigError(`Cấu hình ${name} không hợp lệ.`);
  }
  return Number(value);
}

function flag(value: string | undefined, fallback: boolean, name: string): boolean {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new ConfigError(`Cấu hình ${name} phải là true hoặc false.`);
}

function parseUrl(value: string | undefined, name: string): URL {
  try {
    return new URL(value ?? "");
  } catch {
    throw new ConfigError(`Cấu hình ${name} không hợp lệ.`);
  }
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === "production";
  const databaseUrl = env.DATABASE_URL ?? "";
  const database = parseUrl(databaseUrl, "DATABASE_URL");
  if (!(["postgres:", "postgresql:"].includes(database.protocol) && database.hostname && database.pathname.length > 1)) {
    throw new ConfigError("DATABASE_URL phải trỏ đến một cơ sở dữ liệu PostgreSQL.");
  }

  const csrfSecret = env.CSRF_SECRET?.trim() ?? "";
  if (csrfSecret.length < 32) throw new ConfigError("CSRF_SECRET cần ít nhất 32 ký tự.");

  const origin = parseUrl(env.APP_ORIGIN, "APP_ORIGIN");
  if (!(["http:", "https:"].includes(origin.protocol) && origin.pathname === "/"
    && !origin.username && !origin.password && !origin.search && !origin.hash)) {
    throw new ConfigError("APP_ORIGIN phải là origin HTTP hoặc HTTPS của ứng dụng.");
  }

  const cookieSecure = flag(env.COOKIE_SECURE, production || origin.protocol === "https:", "COOKIE_SECURE");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (production && !local && (origin.protocol !== "https:" || !cookieSecure)) {
    throw new ConfigError("Môi trường công khai cần APP_ORIGIN HTTPS và COOKIE_SECURE=true.");
  }

  return {
    databaseUrl,
    csrfSecret,
    appOrigin: origin.origin,
    host: env.HOST ?? "127.0.0.1",
    port: positiveInteger(env.PORT, 3000, 65_535, "PORT"),
    trustProxy: flag(env.TRUST_PROXY, false, "TRUST_PROXY"),
    enableSwagger: flag(env.ENABLE_SWAGGER, !production, "ENABLE_SWAGGER"),
    cookieSecure,
    dbPoolMax: positiveInteger(env.DB_POOL_MAX, 10, 50, "DB_POOL_MAX"),
  };
}
