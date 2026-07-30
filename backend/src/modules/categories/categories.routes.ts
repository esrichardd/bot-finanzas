import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Database } from "../../infra/db/client.js";
import {
  categoryListResponse,
  categoryResponse,
  createCategoryInput,
  updateCategoryInput,
} from "./categories.types.js";
import {
  archiveCategory,
  createCategory,
  listCategories,
  updateCategory,
} from "./categories.service.js";

const idParam = z.object({ id: z.string().uuid() });

export async function categoriesRoutes(
  app: FastifyInstance,
  opts: { db: Database; requireAuth: preHandlerHookHandler },
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/categories",
    {
      preHandler: opts.requireAuth,
      schema: { response: { 200: categoryListResponse } },
    },
    async (request) => listCategories(opts.db, request.user!.id),
  );

  r.post(
    "/categories",
    {
      preHandler: opts.requireAuth,
      schema: {
        body: createCategoryInput,
        response: { 201: categoryResponse },
      },
    },
    async (request, reply) => {
      const created = await createCategory(
        opts.db,
        request.user!.id,
        request.body,
      );
      return reply.code(201).send(created);
    },
  );

  r.patch(
    "/categories/:id",
    {
      preHandler: opts.requireAuth,
      schema: {
        params: idParam,
        body: updateCategoryInput,
        response: { 200: categoryResponse },
      },
    },
    async (request) =>
      updateCategory(
        opts.db,
        request.user!.id,
        request.params.id,
        request.body,
      ),
  );

  // DELETE archiva (soft delete); nunca borra filas.
  r.delete(
    "/categories/:id",
    {
      preHandler: opts.requireAuth,
      schema: { params: idParam, response: { 204: z.null() } },
    },
    async (request, reply) => {
      await archiveCategory(opts.db, request.user!.id, request.params.id);
      return reply.code(204).send(null);
    },
  );
}
