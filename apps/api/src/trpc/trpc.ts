import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { AppError } from "../utils/errors";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        code: error.code,
        message: error.message
      }
    };
  }
});

const authMiddleware = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required"
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});

const serviceErrorMiddleware = t.middleware(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error instanceof AppError) {
      throw new TRPCError({
        code: mapHttpStatusToTrpcCode(error.statusCode),
        message: error.message,
        cause: error
      });
    }
    throw error;
  }
});

function mapHttpStatusToTrpcCode(
  statusCode: number
): "BAD_REQUEST" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "TOO_MANY_REQUESTS" | "INTERNAL_SERVER_ERROR" {
  if (statusCode === 400) {
    return "BAD_REQUEST";
  }
  if (statusCode === 401) {
    return "UNAUTHORIZED";
  }
  if (statusCode === 403) {
    return "FORBIDDEN";
  }
  if (statusCode === 404) {
    return "NOT_FOUND";
  }
  if (statusCode === 409) {
    return "CONFLICT";
  }
  if (statusCode === 429) {
    return "TOO_MANY_REQUESTS";
  }
  return "INTERNAL_SERVER_ERROR";
}

export const router = t.router;
export const publicProcedure = t.procedure.use(serviceErrorMiddleware);
export const protectedProcedure = publicProcedure.use(authMiddleware);
