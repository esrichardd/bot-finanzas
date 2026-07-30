import type {
  FastifyBaseLogger,
  FastifyError,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { AppError } from "../shared/errors.js";

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof AppError) {
    reply.status(error.statusCode).send({
      error: error.code,
      message: error.message,
    });
    return;
  }

  if (error.validation) {
    reply.status(400).send({
      error: "VALIDATION_ERROR",
      message: error.message,
    });
    return;
  }

  const logger = request.log as FastifyBaseLogger;
  logger.error({ err: error }, "Unexpected request error");
  reply.status(500).send({
    error: "INTERNAL_SERVER_ERROR",
    message: "Internal server error",
  });
}
