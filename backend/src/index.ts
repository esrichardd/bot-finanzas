import { env } from "./config/env.js";
import { createServer } from "./http/server.js";

const app = createServer(env);

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, "shutting down");
  await app.close(); // drena requests en vuelo y dispara onClose → cierre de DB
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

try {
  await app.listen({ host: "0.0.0.0", port: env.PORT });
} catch (error) {
  app.log.error({ err: error }, "Unable to start server");
  await app.close();
  process.exitCode = 1;
}
