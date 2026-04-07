import { and, eq, lt } from "drizzle-orm";
import { db, type Database } from "../client";
import { idempotencyKeys } from "../schema";

function getExecutor(executor?: Database): Database {
  return executor ?? db;
}

export const idempotencyRepository = {
  async find(userId: string, action: string, idempotencyKey: string, executor?: Database) {
    return getExecutor(executor).query.idempotencyKeys.findFirst({
      where: and(
        eq(idempotencyKeys.userId, userId),
        eq(idempotencyKeys.action, action),
        eq(idempotencyKeys.idempotencyKey, idempotencyKey)
      )
    });
  },

  async createPending(payload: { id: string; userId: string; action: string; idempotencyKey: string }, executor?: Database) {
    await getExecutor(executor).insert(idempotencyKeys).values({
      id: payload.id,
      userId: payload.userId,
      action: payload.action,
      idempotencyKey: payload.idempotencyKey,
      status: "pending"
    });
  },

  async markCompleted(userId: string, action: string, idempotencyKey: string, responseJson: unknown, executor?: Database) {
    await getExecutor(executor)
      .update(idempotencyKeys)
      .set({
        status: "completed",
        responseJson
      })
      .where(
        and(
          eq(idempotencyKeys.userId, userId),
          eq(idempotencyKeys.action, action),
          eq(idempotencyKeys.idempotencyKey, idempotencyKey)
        )
      );
  },

  async cleanupExpired(cutoff: Date, executor?: Database) {
    await getExecutor(executor).delete(idempotencyKeys).where(lt(idempotencyKeys.createdAt, cutoff));
  }
};
