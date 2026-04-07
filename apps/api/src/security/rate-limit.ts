import { env } from "../config/env";
import { AppError } from "../utils/errors";

interface Counter {
  count: number;
  resetAt: number;
}

const criticalActionCounter = new Map<string, Counter>();

function cleanupCounter(now: number): void {
  for (const [key, value] of criticalActionCounter.entries()) {
    if (value.resetAt <= now) {
      criticalActionCounter.delete(key);
    }
  }
}

export function assertUserCriticalRateLimit(userId: string, action: string): void {
  const now = Date.now();
  cleanupCounter(now);
  const key = `${userId}:${action}`;
  const current = criticalActionCounter.get(key);
  if (!current || current.resetAt <= now) {
    criticalActionCounter.set(key, {
      count: 1,
      resetAt: now + env.RATE_LIMIT_WINDOW_MS
    });
    return;
  }
  current.count += 1;
  if (current.count > env.RATE_LIMIT_CRITICAL_MAX) {
    throw new AppError("Too many critical actions, please retry shortly.", "RATE_LIMITED", 429);
  }
}
