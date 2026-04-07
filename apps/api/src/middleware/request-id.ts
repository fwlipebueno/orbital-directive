import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function requestIdMiddleware(request: Request, response: Response, next: NextFunction): void {
  const requestId = randomUUID();
  request.requestId = requestId;
  response.setHeader("x-request-id", requestId);
  next();
}
