// Config exclusiva para `npx @better-auth/cli generate`.
// La CLI solo INTROSPECCIONA la forma del config para generar el schema de
// tablas: nunca se conecta a la DB ni usa estos valores. Por eso son dummies
// fijos a propósito — la generación debe ser determinista y funcionar en
// cualquier máquina sin .env ni entorno válido. NO importar config/env.ts
// aquí ni leer process.env (regla 6 de ARCHITECTURE.md).
import { createDb } from "../db/client.js";
import { createAuth } from "./auth.js";

const { db } = createDb(
  "postgres://cli:cli@localhost:5432/cli-generation-only",
);

export const auth = createAuth(db, {
  NODE_ENV: "development",
  PORT: 3000,
  LOG_LEVEL: "info",
  DATABASE_URL: "postgres://cli:cli@localhost:5432/cli-generation-only",
  BETTER_AUTH_SECRET: "cli-generation-only-secret-32-chars!!",
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_TRUSTED_ORIGINS: "",
});
