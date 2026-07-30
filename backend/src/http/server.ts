import Fastify, { type FastifyInstance } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type { Env } from "../config/env.js";
import { errorHandler } from "./error-handler.js";
import { createDb, type Database } from "../infra/db/client.js";
import { createAuth } from "../infra/auth/auth.js";
import { authRoutes } from "../infra/auth/auth.routes.js";
import { buildRequireAuth } from "../infra/auth/require-auth.js";
import { healthRoutes } from "../modules/health/health.routes.js";
import { usersRoutes } from "../modules/users/users.routes.js";
import { categoriesRoutes } from "../modules/categories/categories.routes.js";
import { accountsRoutes } from "../modules/accounts/accounts.routes.js";
import { movementsRoutes } from "../modules/movements/movements.routes.js";
import { creditCardsRoutes } from "../modules/credit-cards/credit-cards.routes.js";

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

  app.decorateRequest("user", null);

  const auth = createAuth(db, env);
  const requireAuth = buildRequireAuth(auth);

  app.register(healthRoutes, { db });
  app.register(
    async (api) => {
      api.register(authRoutes, { auth });
      api.register(usersRoutes, { requireAuth });
      api.register(categoriesRoutes, { db, requireAuth });
      api.register(accountsRoutes, { db, requireAuth });
      api.register(movementsRoutes, { db, requireAuth });
      api.register(creditCardsRoutes, { db, requireAuth });
    },
    { prefix: "/api" },
  );

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
