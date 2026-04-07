import crypto from "node:crypto";
import type { Request, Response } from "express";
import { env } from "../config/env";

function tokenFromHeader(request: Request): string | undefined {
  const headerName = env.CSRF_HEADER_NAME.toLowerCase();
  const value = request.headers[headerName];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export function ensureCsrfToken(request: Request, response: Response): string {
  const existing = request.cookies[env.CSRF_COOKIE_NAME] as string | undefined;
  if (existing) {
    return existing;
  }
  const token = crypto.randomBytes(32).toString("base64url");
  response.cookie(env.CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    sameSite: env.SESSION_COOKIE_SAME_SITE,
    secure: env.SESSION_COOKIE_SECURE,
    path: "/"
  });
  return token;
}

export function validateCsrf(request: Request): boolean {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method.toUpperCase())) {
    return true;
  }
  const cookieToken = request.cookies[env.CSRF_COOKIE_NAME] as string | undefined;
  const headerToken = tokenFromHeader(request);
  return Boolean(cookieToken && headerToken && cookieToken === headerToken);
}
