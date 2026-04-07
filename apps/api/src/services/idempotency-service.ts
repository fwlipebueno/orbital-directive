import { randomUUID } from "node:crypto";
import { env } from "../config/env";
import type { Database } from "../db/client";
import { idempotencyRepository } from "../db/repositories/idempotency-repository";
import { addMinutes } from "../utils/time";
import { AppError } from "../utils/errors";

interface IdempotencyInput<T> {
  userId: string;
  action: string;
  idempotencyKey: string;
  executor: Database;
  run: () => Promise<T>;
}

export const idempotencyService = {
  async run<T>(input: IdempotencyInput<T>): Promise<T> {
    const cutoff = addMinutes(new Date(), -env.IDEMPOTENCY_TTL_MINUTES);
    await idempotencyRepository.cleanupExpired(cutoff, input.executor);

    const existing = await idempotencyRepository.find(input.userId, input.action, input.idempotencyKey, input.executor);
    if (existing?.status === "completed" && existing.responseJson) {
      return existing.responseJson as T;
    }
    if (existing?.status === "pending") {
      throw new AppError("Action already in progress for this idempotency key.", "IDEMPOTENCY_IN_PROGRESS", 409);
    }

    if (!existing) {
      try {
        await idempotencyRepository.createPending(
          {
            id: randomUUID(),
            userId: input.userId,
            action: input.action,
            idempotencyKey: input.idempotencyKey
          },
          input.executor
        );
      } catch (error) {
        const maybeDuplicate = typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY";
        if (!maybeDuplicate) {
          throw error;
        }

        const justCreated = await idempotencyRepository.find(
          input.userId,
          input.action,
          input.idempotencyKey,
          input.executor
        );
        if (justCreated?.status === "completed" && justCreated.responseJson) {
          return justCreated.responseJson as T;
        }
        throw new AppError("Action already in progress for this idempotency key.", "IDEMPOTENCY_IN_PROGRESS", 409);
      }
    }

    const result = await input.run();
    await idempotencyRepository.markCompleted(input.userId, input.action, input.idempotencyKey, result, input.executor);
    return result;
  }
};
