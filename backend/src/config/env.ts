import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

// Único .env del sistema: el de la raíz del repo (regla de ARCHITECTURE.md).
// Resuelto relativo a ESTE archivo, no al cwd. En Docker no existe y no hace nada: las vars llegan inyectadas por el compose (que además tienen prioridad, dotenv nunca pisa variables ya definidas).
dotenv.config({
  path: path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../.env",
  ), // src/config/ → raíz del repo
  quiet: true,
});

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().max(65535).default(3000),
    DATABASE_URL: z.string().url().startsWith("postgres"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace"])
      .default("info"),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
    BETTER_AUTH_TRUSTED_ORIGINS: z.string().default(""),
    OTEL_TRACING_ENABLED: z.enum(["true", "false"]).optional(),
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: z.string().url().optional(),
    OTEL_SERVICE_NAME: z.string().trim().min(1).optional(),
    OTEL_SERVICE_VERSION: z.string().trim().min(1).optional(),
    OTEL_TRACE_SAMPLE_RATIO: z.coerce.number().min(0).max(1).optional(),
  })
  .superRefine((config, context) => {
    if (
      config.OTEL_TRACING_ENABLED === "true" &&
      config.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"],
        message: "es requerida cuando OTEL_TRACING_ENABLED=true",
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Configuración de entorno inválida:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
