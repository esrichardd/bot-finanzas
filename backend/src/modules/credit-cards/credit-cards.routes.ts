import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Database } from "../../infra/db/client.js";
import {
  creditCardListResponse,
  creditCardResponse,
  configuredCreditCardResponse,
  listCreditCardsQuery,
  openCreditCardInput,
  updateCreditCardInput,
  upsertCreditCardInput,
} from "./credit-cards.types.js";
import {
  getCreditCard,
  listCreditCards,
  openCreditCard,
  updateCreditCard,
  upsertCreditCard,
} from "./credit-cards.service.js";

const idParam = z.object({ id: z.string().uuid() });

export async function creditCardsRoutes(
  app: FastifyInstance,
  opts: { db: Database; requireAuth: preHandlerHookHandler },
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    "/credit-cards",
    {
      preHandler: opts.requireAuth,
      schema: {
        body: openCreditCardInput,
        response: { 201: configuredCreditCardResponse },
      },
    },
    async (request, reply) => {
      const created = await openCreditCard(opts.db, request.user!.id, request.body);
      return reply.code(201).send(created);
    },
  );

  r.get(
    "/credit-cards",
    {
      preHandler: opts.requireAuth,
      schema: {
        querystring: listCreditCardsQuery,
        response: { 200: creditCardListResponse },
      },
    },
    async (request) => listCreditCards(opts.db, request.user!.id, request.query.status),
  );

  r.patch(
    "/credit-cards/:id",
    {
      preHandler: opts.requireAuth,
      schema: {
        params: idParam,
        body: updateCreditCardInput,
        response: { 200: configuredCreditCardResponse },
      },
    },
    async (request) => updateCreditCard(opts.db, request.user!.id, request.params.id, request.body),
  );

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
