import { randomUUID } from "node:crypto";
import { env } from "../config/env";
import { sessionRepository } from "../db/repositories/session-repository";
import { addHours } from "../utils/time";
import { randomToken, sha256 } from "../utils/crypto";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  isDemo: boolean;
}

export interface SessionValidationResult {
  sessionId: string;
  token: string;
  user: SessionUser;
  expiresAt: Date;
}

export const sessionService = {
  async createSession(
    user: SessionUser,
    clientInfo?: {
      ipAddress?: string;
      userAgent?: string;
    }
  ) {
    const token = randomToken();
    const tokenHash = sha256(token + env.SESSION_SECRET);
    const sessionId = randomUUID();
    const expiresAt = addHours(new Date(), env.SESSION_TTL_HOURS);

    await sessionRepository.create({
      id: sessionId,
      userId: user.id,
      tokenHash,
      expiresAt,
      ipAddress: clientInfo?.ipAddress,
      userAgent: clientInfo?.userAgent
    });

    return {
      sessionId,
      token,
      expiresAt
    };
  },

  async validateSessionToken(token: string) {
    const now = new Date();
    const tokenHash = sha256(token + env.SESSION_SECRET);
    const session = await sessionRepository.findActiveByTokenHash(tokenHash, now);

    if (!session) {
      return null;
    }

    await sessionRepository.touch(session.id);
    return session;
  },

  async revokeSession(sessionId: string) {
    await sessionRepository.revoke(sessionId);
  }
};
