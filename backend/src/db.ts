import pg from "pg";
import type { Config } from "./config.js";

export function createPool(config: Pick<Config, "databaseUrl" | "dbPoolMax">): pg.Pool {
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: config.dbPoolMax,
    connectionTimeoutMillis: 3_000,
    idleTimeoutMillis: 10_000,
    statement_timeout: 5_000,
    idle_in_transaction_session_timeout: 10_000,
  });
  pool.on("error", () => console.error("[db] idle_connection_error"));
  return pool;
}
