import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { userRepository } from "../db/repositories/user-repository";
import { sessionService } from "../security/session";

export async function authSessionMiddleware(request: Request, _response: Response, next: NextFunction) {
  const token = request.cookies?.[env.SESSION_COOKIE_NAME] as string | undefined;
  if (!token) {
    return next();
  }

  const session = await sessionService.validateSessionToken(token);
  if (!session) {
    return next();
  }

  const user = await userRepository.findById(session.userId);
  if (!user) {
    return next();
  }

  request.authUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    isDemo: user.isDemo
  };
  request.sessionId = session.id;

  return next();
}
