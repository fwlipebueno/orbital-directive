import { db, type Database } from "../client";
import { auditLogs } from "../schema";

function getExecutor(executor?: Database): Database {
  return executor ?? db;
}

export const auditRepository = {
  async append(
    payload: {
      userId?: string | undefined;
      stationId?: string | undefined;
      action: string;
      resourceType: string;
      resourceId?: string | undefined;
      ipAddress?: string | undefined;
      userAgent?: string | undefined;
      metadata?: unknown | undefined;
    },
    executor?: Database
  ) {
    await getExecutor(executor).insert(auditLogs).values({
      userId: payload.userId,
      stationId: payload.stationId,
      action: payload.action,
      resourceType: payload.resourceType,
      resourceId: payload.resourceId,
      ipAddress: payload.ipAddress,
      userAgent: payload.userAgent,
      metadata: payload.metadata
    });
  }
};


