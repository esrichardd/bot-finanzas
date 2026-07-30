import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config({ path: "../.env", quiet: true });

export default defineConfig({
  schema: "./src/infra/db/schema.ts",
  out: "./src/infra/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://app:app@localhost:5432/app",
  },
});
