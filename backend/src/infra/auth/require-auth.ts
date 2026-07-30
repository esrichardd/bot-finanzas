import type {
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
} from "fastify";
import type { Auth } from "./auth.js";
import { toWebHeaders } from "./auth.routes.js";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

declare module "fastify" {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}

export function buildRequireAuth(auth: Auth): preHandlerHookHandler {
  return async function requireAuth(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const session = await auth.api.getSession({
      headers: toWebHeaders(request),
    });

    if (!session) {
      await reply.code(401).send({ error: "UNAUTHORIZED" });
      return;
    }

    request.user = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    };
  };
}
