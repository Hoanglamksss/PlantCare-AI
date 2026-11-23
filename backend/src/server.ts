import { createServer } from "node:http";
import { createApp } from "./app.js";
import { ConfigError, readConfig } from "./config.js";
import { createPool } from "./db.js";
import { startEmbeddedInference, stopEmbeddedInference } from "./modules/media/embedded-inference.js";
import { startScheduleWorker } from "./modules/schedules/worker.js";

async function start(): Promise<void> {
  const config = readConfig();
  let stopping = false;
  const inference = await startEmbeddedInference(() => {
    if (stopping) return;
    console.error("[screening] embedded_python_exited");
    process.exitCode = 1;
    shutdown();
  });
  const pool = createPool(config);
  let app: ReturnType<typeof createApp>;
  try {
    app = createApp(config, pool);
  } catch (error) {
    stopEmbeddedInference(inference);
    await pool.end();
    throw error;
  }
  const stopSchedules = startScheduleWorker(pool);
  const server = createServer({ requestTimeout: 15_000, headersTimeout: 10_000, keepAliveTimeout: 5_000 }, app);

  server.once("error", () => {
    console.error("[http] listen_failed");
    process.exitCode = 1;
    shutdown();
  });
  server.listen(config.port, config.host, () => console.log(`[http] listening port=${config.port}`));

  function shutdown(): void {
    if (stopping) return;
    stopping = true;
    const timeout = setTimeout(() => {
      server.closeAllConnections();
      inference?.kill("SIGKILL");
      process.exit(1);
    }, 20_000);
    timeout.unref();

    server.close(() => {
      stopEmbeddedInference(inference);
      void stopSchedules().then(() => pool.end()).catch(() => {
        console.error("[db] shutdown_failed");
        process.exitCode = 1;
      }).finally(() => clearTimeout(timeout));
    });
  }

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

void start().catch((error: unknown) => {
  console.error(error instanceof ConfigError ? error.message : "[http] startup_failed");
  process.exitCode = 1;
});
