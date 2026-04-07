import type { CookieOptions, Response } from "express";
import { env } from "../config/env";

export function getSessionCookieOptions(expiresAt: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: env.SESSION_COOKIE_SECURE,
    sameSite: env.SESSION_COOKIE_SAME_SITE,
    expires: expiresAt,
    path: "/"
  };
}

export function setSessionCookie(response: Response, token: string, expiresAt: Date): void {
  response.cookie(env.SESSION_COOKIE_NAME, token, getSessionCookieOptions(expiresAt));
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie(env.SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: env.SESSION_COOKIE_SECURE,
    sameSite: env.SESSION_COOKIE_SAME_SITE,
    path: "/"
  });
}
