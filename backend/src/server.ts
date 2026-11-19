import { createServer } from "node:http";
import { createApp } from "./app.js";
import { ConfigError, readConfig } from "./config.js";
import { createPool } from "./db.js";
import { startScheduleWorker } from "./modules/schedules/worker.js";

function start(): void {
  const config = readConfig();
  const pool = createPool(config);
  const app = createApp(config, pool);
  const stopSchedules = startScheduleWorker(pool);
  const server = createServer({ requestTimeout: 15_000, headersTimeout: 10_000, keepAliveTimeout: 5_000 }, app);

  server.once("error", () => {
    console.error("[http] listen_failed");
    process.exitCode = 1;
    void stopSchedules().then(() => pool.end()).catch(() => console.error("[db] shutdown_failed"));
  });
  server.listen(config.port, config.host, () => console.log(`[http] listening port=${config.port}`));

  let stopping = false;
  function shutdown(): void {
    if (stopping) return;
    stopping = true;
    const timeout = setTimeout(() => {
      server.closeAllConnections();
      process.exit(1);
    }, 20_000);
    timeout.unref();

    server.close(() => {
      void stopSchedules().then(() => pool.end()).catch(() => {
        console.error("[db] shutdown_failed");
        process.exitCode = 1;
      }).finally(() => clearTimeout(timeout));
    });
  }

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

try {
  start();
} catch (error) {
  console.error(error instanceof ConfigError ? error.message : "[http] startup_failed");
  process.exitCode = 1;
}
