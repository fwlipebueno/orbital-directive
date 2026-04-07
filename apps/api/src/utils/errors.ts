export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly isOperational: boolean;

  constructor(message: string, code = "INTERNAL_ERROR", statusCode = 500, isOperational = true) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
  }
}

export function assertOrThrow(condition: boolean, message: string, code = "BAD_REQUEST", statusCode = 400): void {
  if (!condition) {
    throw new AppError(message, code, statusCode);
  }
}
