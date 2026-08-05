import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Database } from "../../infra/db/client.js";
import {
  accountListResponse,
  accountResponse,
  currencyListResponse,
  listAccountsQuery,
  openAccountInput,
  updateAccountInput,
} from "./accounts.types.js";
import {
  listAccounts,
  listCurrencies,
  restoreAccount,
  updateAccount,
} from "./accounts.service.js";
import {
  archiveEmptyAccount,
  openAccount,
} from "./account-lifecycle.service.js";

const idParam = z.object({ id: z.string().uuid() });

export async function accountsRoutes(
  app: FastifyInstance,
  opts: { db: Database; requireAuth: preHandlerHookHandler },
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/currencies",
    {
      preHandler: opts.requireAuth,
      schema: { response: { 200: currencyListResponse } },
    },
    async () => listCurrencies(opts.db),
  );

  r.get(
    "/accounts",
    {
      preHandler: opts.requireAuth,
      schema: {
        querystring: listAccountsQuery,
        response: { 200: accountListResponse },
      },
    },
    async (request) =>
      listAccounts(opts.db, request.user!.id, request.query.status),
  );

  r.post(
    "/accounts",
    {
      preHandler: opts.requireAuth,
      schema: { body: openAccountInput, response: { 201: accountResponse } },
    },
    async (request, reply) => {
      const created = await openAccount(
        opts.db,
        request.user!.id,
        request.body,
      );
      return reply.code(201).send(created);
    },
  );

  r.patch(
    "/accounts/:id",
    {
      preHandler: opts.requireAuth,
      schema: {
        params: idParam,
        body: updateAccountInput,
        response: { 200: accountResponse },
      },
    },
    async (request) =>
      updateAccount(opts.db, request.user!.id, request.params.id, request.body),
  );

  r.delete(
    "/accounts/:id",
    {
      preHandler: opts.requireAuth,
      schema: { params: idParam, response: { 204: z.null() } },
    },
    async (request, reply) => {
      await archiveEmptyAccount(opts.db, request.user!.id, request.params.id);
      return reply.code(204).send(null);
    },
  );

  r.post(
    "/accounts/:id/restore",
    {
      preHandler: opts.requireAuth,
      schema: { params: idParam, response: { 200: accountResponse } },
    },
    async (request) =>
      restoreAccount(opts.db, request.user!.id, request.params.id),
  );
}
