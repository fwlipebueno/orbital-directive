import { TRPCClientError } from "@trpc/client";

export function isUnauthorizedError(error: unknown): boolean {
  if (error instanceof TRPCClientError) {
    return error.data?.code === "UNAUTHORIZED";
  }
  return false;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error";
}

export function isTransientError(error: unknown): boolean {
  if (error instanceof TRPCClientError) {
    const httpStatus = error.data?.httpStatus;
    if (typeof httpStatus === "number" && httpStatus >= 500) {
      return true;
    }

    const code = error.data?.code;
    if (code === "TIMEOUT" || code === "INTERNAL_SERVER_ERROR") {
      return true;
    }

    return /fetch|network|timeout|econn|failed to fetch/i.test(error.message);
  }

  if (error instanceof TypeError) {
    return true;
  }

  if (error instanceof Error) {
    return /fetch|network|timeout|econn|failed to fetch/i.test(error.message);
  }

  return false;
}
