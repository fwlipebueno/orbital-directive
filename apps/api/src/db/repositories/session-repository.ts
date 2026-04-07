import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../client";
import { sessions } from "../schema";

export interface CreateSessionInput {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

export const sessionRepository = {
  async create(input: CreateSessionInput) {
    await db.insert(sessions).values({
      id: input.id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent
    });
  },

  async findActiveByTokenHash(tokenHash: string, now: Date) {
    return db.query.sessions.findFirst({
      where: and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt), gt(sessions.expiresAt, now))
    });
  },

  async touch(sessionId: string) {
    await db.update(sessions).set({ lastUsedAt: new Date() }).where(eq(sessions.id, sessionId));
  },

  async revoke(sessionId: string) {
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
  },

  async revokeByUser(userId: string) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }
};

