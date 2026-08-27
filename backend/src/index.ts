import { env } from "./config/env.js";
import {
  buildTelemetryConfig,
  startTelemetry,
} from "./infra/telemetry/telemetry.js";

// La instrumentación debe iniciar antes de cargar Fastify y Pino para que
// OpenTelemetry pueda interceptar esos módulos desde su primera importación.
const telemetry = startTelemetry(buildTelemetryConfig(env));
const { createServer } = await import("./http/server.js");

const app = createServer(env);

if (telemetry.startupError !== undefined) {
  app.log.warn(
    { err: telemetry.startupError },
    "Tracing could not start; the application will continue without traces",
  );
} else if (telemetry.enabled) {
  app.log.info("OpenTelemetry tracing enabled");
}

let shuttingDown = false;

const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  app.log.info({ signal }, "shutting down");

  try {
    await app.close(); // drena requests en vuelo y dispara onClose → cierre de DB
    await telemetry.shutdown(); // fuerza el envío del último lote de spans
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, "Unable to shut down cleanly");
    process.exit(1);
  }
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

try {
  await app.listen({ host: "0.0.0.0", port: env.PORT });
} catch (error) {
  app.log.error({ err: error }, "Unable to start server");
  await app.close();
  await telemetry.shutdown();
  process.exitCode = 1;
}
