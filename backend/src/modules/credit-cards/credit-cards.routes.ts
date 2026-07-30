import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Database } from "../../infra/db/client.js";
import { creditCardResponse, upsertCreditCardInput } from "./credit-cards.types.js";
import { getCreditCard, upsertCreditCard } from "./credit-cards.service.js";

const idParam = z.object({ id: z.string().uuid() });

export async function creditCardsRoutes(
  app: FastifyInstance,
  opts: { db: Database; requireAuth: preHandlerHookHandler },
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.put(
    "/accounts/:id/credit-card",
    {
      preHandler: opts.requireAuth,
      schema: {
        params: idParam,
        body: upsertCreditCardInput,
        response: { 200: creditCardResponse },
      },
    },
    async (request) =>
      upsertCreditCard(opts.db, request.user!.id, request.params.id, request.body),
  );

  r.get(
    "/accounts/:id/credit-card",
    {
      preHandler: opts.requireAuth,
      schema: { params: idParam, response: { 200: creditCardResponse } },
    },
    async (request) =>
      getCreditCard(opts.db, request.user!.id, request.params.id),
  );
}
