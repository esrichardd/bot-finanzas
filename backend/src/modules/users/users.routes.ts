import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

const meResponse = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
});

export async function usersRoutes(
  app: FastifyInstance,
  opts: { requireAuth: preHandlerHookHandler },
): Promise<void> {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/me",
    {
      preHandler: opts.requireAuth,
      schema: { response: { 200: meResponse } },
    },
    async (request) => {
      // requireAuth garantiza user !== null en este punto
      return request.user!;
    },
  );
}
