import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { AppError } from "../utils/errors";

export function errorMiddleware(error: unknown, request: Request, response: Response, _next: NextFunction): void {
  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        requestId: request.requestId
      }
    });
    return;
  }

  logger.error({
    error,
    requestId: request.requestId,
    path: request.path,
    method: request.method
  }, "Unhandled error");

  response.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: env.NODE_ENV === "production" ? "Unexpected internal error" : "Unexpected internal error. Check API logs.",
      requestId: request.requestId
    }
  });
}
