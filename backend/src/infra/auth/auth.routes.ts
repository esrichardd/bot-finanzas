import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Auth } from "./auth.js";

export function toWebHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    headers.append(
      key,
      Array.isArray(value) ? value.join(", ") : value.toString(),
    );
  }
  return headers;
}

export async function authRoutes(
  app: FastifyInstance,
  opts: { auth: Auth },
): Promise<void> {
  app.route({
    method: ["GET", "POST"],
    url: "/auth/*",
    async handler(request, reply) {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const webRequest = new Request(url.toString(), {
        method: request.method,
        headers: toWebHeaders(request),
        body: request.body ? JSON.stringify(request.body) : undefined,
      });

      const response = await opts.auth.handler(webRequest);

      reply.status(response.status);
      response.headers.forEach((value, key) => {
        reply.header(key, value);
      });
      reply.send(response.body ? await response.text() : null);
    },
  });
}
