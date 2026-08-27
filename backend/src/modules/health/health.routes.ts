import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Database } from "../../infra/db/client.js";
import { checkHealth } from "./health.service.js";

const okResponse = z.object({
  status: z.literal("ok"),
  checks: z.object({ db: z.literal("ok") }),
});

const degradedResponse = z.object({
  status: z.literal("degraded"),
  checks: z.object({ db: z.literal("error") }),
});

export async function healthRoutes(
  app: FastifyInstance,
  opts: { db: Database },
): Promise<void> {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/health",
    {
      logLevel: "warn",
      schema: {
        response: { 200: okResponse, 503: degradedResponse },
      },
    },
    async (request, reply) => {
      const result = await checkHealth(opts.db);

      if (result.status === "degraded") {
        request.log.warn(
          { checks: result.checks },
          "Health check is degraded",
        );
      }

      return reply.code(result.status === "ok" ? 200 : 503).send(result);
    },
  );
}
