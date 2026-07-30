import Fastify, { type FastifyInstance } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { Env } from "../config/env.js";
import { errorHandler } from "./error-handler.js";
import { createDb, type Database } from "../infra/db/client.js";
import { healthRoutes } from "../modules/health/health.routes.js";

export interface ServerDependencies {
  env: Env;
  db: Database;
  closeDb?: () => Promise<void>;
}

export function buildServer({
  env,
  db,
  closeDb,
}: ServerDependencies): FastifyInstance {
  const app = Fastify({ logger: { level: env.LOG_LEVEL } });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);

  app.register(healthRoutes, { db });

  if (closeDb) {
    app.addHook("onClose", closeDb);
  }

  return app;
}

export function createServer(env: Env): FastifyInstance {
  const database = createDb(env.DATABASE_URL);
  return buildServer({
    env,
    db: database.db,
    closeDb: database.close,
  });
}
