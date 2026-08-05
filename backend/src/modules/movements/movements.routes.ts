import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Database } from "../../infra/db/client.js";
import {
  balanceResponse,
  adjustAccountBalanceInput,
  createMovementInput,
  createTransferInput,
  listMovementsQuery,
  movementListResponse,
  movementResponse,
  transferResponse,
  updateMovementInput,
} from "./movements.types.js";
import {
  createMovement,
  createTransfer,
  adjustAccountBalance,
  deleteMovement,
  deleteTransfer,
  getBalances,
  listMovements,
  updateMovement,
} from "./movements.service.js";

const idParam = z.object({ id: z.string().uuid() });

export async function movementsRoutes(
  app: FastifyInstance,
  opts: { db: Database; requireAuth: preHandlerHookHandler },
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/movements",
    {
      preHandler: opts.requireAuth,
      schema: { querystring: listMovementsQuery, response: { 200: movementListResponse } },
    },
    async (request) => listMovements(opts.db, request.user!.id, request.query),
  );

  r.post(
    "/accounts/:id/balance-adjustments",
    {
      preHandler: opts.requireAuth,
      schema: {
        params: idParam,
        body: adjustAccountBalanceInput,
        response: { 201: movementResponse },
      },
    },
    async (request, reply) => {
      const movement = await adjustAccountBalance(
        opts.db,
        request.user!.id,
        request.params.id,
        request.body,
      );
      return reply.code(201).send(movement);
    },
  );

  r.post(
    "/movements",
    {
      preHandler: opts.requireAuth,
      schema: { body: createMovementInput, response: { 201: movementResponse } },
    },
    async (request, reply) => {
      const created = await opts.db.transaction((tx) =>
        createMovement(tx, request.user!.id, request.body),
      );
      return reply.code(201).send(created);
    },
  );

  r.patch(
    "/movements/:id",
    {
      preHandler: opts.requireAuth,
      schema: {
        params: idParam,
        body: updateMovementInput,
        response: { 200: movementResponse },
      },
    },
    async (request) =>
      updateMovement(opts.db, request.user!.id, request.params.id, request.body),
  );

  r.delete(
    "/movements/:id",
    {
      preHandler: opts.requireAuth,
      schema: { params: idParam, response: { 204: z.null() } },
    },
    async (request, reply) => {
      await deleteMovement(opts.db, request.user!.id, request.params.id);
      return reply.code(204).send(null);
    },
  );

  r.get(
    "/balances",
    {
      preHandler: opts.requireAuth,
      schema: { response: { 200: balanceResponse } },
    },
    async (request) => getBalances(opts.db, request.user!.id),
  );

  r.post(
    "/transfers",
    {
      preHandler: opts.requireAuth,
      schema: { body: createTransferInput, response: { 201: transferResponse } },
    },
    async (request, reply) => {
      const created = await createTransfer(opts.db, request.user!.id, request.body);
      return reply.code(201).send(created);
    },
  );

  r.delete(
    "/transfers/:id",
    {
      preHandler: opts.requireAuth,
      schema: { params: idParam, response: { 204: z.null() } },
    },
    async (request, reply) => {
      await deleteTransfer(opts.db, request.user!.id, request.params.id);
      return reply.code(204).send(null);
    },
  );
}
