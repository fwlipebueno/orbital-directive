import type { inferAsyncReturnType } from "@trpc/server";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";

function getClientIp(options: CreateExpressContextOptions): string {
  const forwarded = options.req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() ?? options.req.ip ?? "unknown";
  }
  return options.req.ip ?? "unknown";
}

export function createContext(options: CreateExpressContextOptions) {
  const rawUserAgent = options.req.headers["user-agent"];
  const userAgent = Array.isArray(rawUserAgent) ? rawUserAgent[0] : rawUserAgent;

  return {
    req: options.req,
    res: options.res,
    user: options.req.authUser,
    sessionId: options.req.sessionId,
    clientIp: getClientIp(options),
    userAgent
  };
}

export type TrpcContext = inferAsyncReturnType<typeof createContext>;
