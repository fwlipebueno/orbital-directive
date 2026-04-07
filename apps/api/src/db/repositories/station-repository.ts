import { INITIAL_RESOURCES, moduleTypes } from "@orbital/shared";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, type Database } from "../client";
import {
  stationCommandStates,
  stationIncidents,
  stationLogs,
  stationModules,
  stationResources,
  stationRunSummaries,
  stations
} from "../schema";

function getExecutor(executor?: Database): Database {
  return executor ?? db;
}

export interface CreateStationInput {
  id: string;
  userId: string;
  name: string;
  now: Date;
}

export const stationRepository = {
  async findByIdAndUser(stationId: string, userId: string, executor?: Database) {
    return getExecutor(executor).query.stations.findFirst({
      where: and(eq(stations.id, stationId), eq(stations.userId, userId))
    });
  },

  async findByUserId(userId: string, executor?: Database) {
    return getExecutor(executor).query.stations.findFirst({
      where: eq(stations.userId, userId)
    });
  },

  async getResources(stationId: string, executor?: Database) {
    return getExecutor(executor).query.stationResources.findFirst({
      where: eq(stationResources.stationId, stationId)
    });
  },

  async getModules(stationId: string, executor?: Database) {
    return getExecutor(executor).query.stationModules.findMany({
      where: eq(stationModules.stationId, stationId),
      orderBy: [asc(stationModules.moduleType)]
    });
  },

  async getIncidents(stationId: string, executor?: Database) {
    return getExecutor(executor).query.stationIncidents.findMany({
      where: eq(stationIncidents.stationId, stationId),
      orderBy: [desc(stationIncidents.createdAt)]
    });
  },

  async getOpenIncidents(stationId: string, executor?: Database) {
    return getExecutor(executor).query.stationIncidents.findMany({
      where: and(eq(stationIncidents.stationId, stationId), eq(stationIncidents.status, "open")),
      orderBy: [desc(stationIncidents.createdAt)]
    });
  },

  async getRecentLogs(stationId: string, limit = 40, executor?: Database) {
    return getExecutor(executor).query.stationLogs.findMany({
      where: eq(stationLogs.stationId, stationId),
      orderBy: [desc(stationLogs.createdAt)],
      limit
    });
  },

  async getRecentRunSummaries(stationId: string, limit = 20, executor?: Database) {
    return getExecutor(executor).query.stationRunSummaries.findMany({
      where: eq(stationRunSummaries.stationId, stationId),
      orderBy: [desc(stationRunSummaries.createdAt)],
      limit
    });
  },

  async getCommandState(stationId: string, executor?: Database) {
    return getExecutor(executor).query.stationCommandStates.findFirst({
      where: eq(stationCommandStates.stationId, stationId)
    });
  },

  async createStationWithDefaults(input: CreateStationInput, executor?: Database) {
    const connection = getExecutor(executor);
    await connection.insert(stations).values({
      id: input.id,
      userId: input.userId,
      name: input.name,
      lastProcessedAt: input.now
    });

    await connection.insert(stationResources).values({
      stationId: input.id,
      energy: String(INITIAL_RESOURCES.energy),
      oxygen: String(INITIAL_RESOURCES.oxygen),
      water: String(INITIAL_RESOURCES.water),
      food: String(INITIAL_RESOURCES.food),
      credits: String(INITIAL_RESOURCES.credits),
      research: String(INITIAL_RESOURCES.research),
      hullIntegrity: String(INITIAL_RESOURCES.hullIntegrity),
      morale: String(INITIAL_RESOURCES.morale)
    });

    for (const moduleType of moduleTypes) {
      await connection.insert(stationModules).values({
        id: randomUUID(),
        stationId: input.id,
        moduleType,
        level: 1,
        health: "100",
        isOnline: true
      });
    }

    await connection.insert(stationCommandStates).values({
      stationId: input.id,
      powerProfile: "balanced",
      subsystemFocus: "balanced",
      thermalPolicy: "nominal"
    });
  },

  async ensureCommandState(stationId: string, executor?: Database) {
    const connection = getExecutor(executor);
    const existing = await this.getCommandState(stationId, connection);
    if (existing) {
      return existing;
    }
    try {
      await connection.insert(stationCommandStates).values({
        stationId,
        powerProfile: "balanced",
        subsystemFocus: "balanced",
        thermalPolicy: "nominal"
      });
    } catch (error) {
      const maybeDuplicate = typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY";
      if (!maybeDuplicate) {
        throw error;
      }
    }
    return this.getCommandState(stationId, connection);
  },

  async incrementVersionAndProcessedAt(stationId: string, processedAt: Date, executor?: Database) {
    await getExecutor(executor)
      .update(stations)
      .set({
        lastProcessedAt: processedAt,
        version: sql`${stations.version} + 1`
      })
      .where(eq(stations.id, stationId));
  },

  async updateResources(
    stationId: string,
    payload: {
      energy: number;
      oxygen: number;
      water: number;
      food: number;
      credits: number;
      research: number;
      hullIntegrity: number;
      morale: number;
    },
    executor?: Database
  ) {
    await getExecutor(executor)
      .update(stationResources)
      .set({
        energy: String(payload.energy),
        oxygen: String(payload.oxygen),
        water: String(payload.water),
        food: String(payload.food),
        credits: String(payload.credits),
        research: String(payload.research),
        hullIntegrity: String(payload.hullIntegrity),
        morale: String(payload.morale)
      })
      .where(eq(stationResources.stationId, stationId));
  },

  async updateModuleStates(
    stationId: string,
    payload: Array<{ moduleType: string; level?: number; health?: number; isOnline?: boolean }>,
    executor?: Database
  ) {
    const connection = getExecutor(executor);
    for (const moduleState of payload) {
      await connection
        .update(stationModules)
        .set({
          level: moduleState.level,
          health: moduleState.health === undefined ? undefined : String(moduleState.health),
          isOnline: moduleState.isOnline
        })
        .where(and(eq(stationModules.stationId, stationId), eq(stationModules.moduleType, moduleState.moduleType)));
    }
  },

  async insertIncident(
    payload: {
      id: string;
      stationId: string;
      incidentType: string;
      severity: number;
      status: "open" | "resolved";
      startedAt: Date;
      endsAt: Date | null;
      metadata?: unknown;
    },
    executor?: Database
  ) {
    await getExecutor(executor).insert(stationIncidents).values({
      id: payload.id,
      stationId: payload.stationId,
      incidentType: payload.incidentType,
      severity: payload.severity,
      status: payload.status,
      startedAt: payload.startedAt,
      endsAt: payload.endsAt,
      metadata: payload.metadata
    });
  },

  async resolveIncident(incidentId: string, resolvedAt: Date, executor?: Database) {
    await getExecutor(executor)
      .update(stationIncidents)
      .set({
        status: "resolved",
        resolvedAt
      })
      .where(eq(stationIncidents.id, incidentId));
  },

  async closeExpiredIncidents(stationId: string, expiredIds: string[], resolvedAt: Date, executor?: Database) {
    if (expiredIds.length === 0) {
      return;
    }
    for (const incidentId of expiredIds) {
      await getExecutor(executor)
        .update(stationIncidents)
        .set({
          status: "resolved",
          resolvedAt
        })
        .where(and(eq(stationIncidents.id, incidentId), eq(stationIncidents.stationId, stationId)));
    }
  },

  async appendLog(
    stationId: string,
    logType: "event" | "action" | "audit" | "system",
    message: string,
    payload?: unknown,
    executor?: Database
  ) {
    await getExecutor(executor).insert(stationLogs).values({
      stationId,
      logType,
      message,
      payload
    });
  },

  async appendRunSummary(
    stationId: string,
    summary: { tickSeconds: number; incidentCount: number; severity: string; criticalResources: string[] },
    executor?: Database
  ) {
    await getExecutor(executor).insert(stationRunSummaries).values({
      stationId,
      tickSeconds: summary.tickSeconds,
      incidentCount: summary.incidentCount,
      severity: summary.severity,
      criticalResources: summary.criticalResources
    });
  },

  async updateCommandState(
    stationId: string,
    payload: {
      powerProfile: "balanced" | "lifeSupport" | "research" | "shielded";
      subsystemFocus: "balanced" | "integrity" | "research" | "morale";
      thermalPolicy: "nominal" | "economy" | "boost";
    },
    executor?: Database
  ) {
    await getExecutor(executor)
      .update(stationCommandStates)
      .set({
        powerProfile: payload.powerProfile,
        subsystemFocus: payload.subsystemFocus,
        thermalPolicy: payload.thermalPolicy
      })
      .where(eq(stationCommandStates.stationId, stationId));
  },

  async markOrbitalBurn(stationId: string, executedAt: Date, executor?: Database) {
    await getExecutor(executor)
      .update(stationCommandStates)
      .set({
        lastOrbitalBurnAt: executedAt
      })
      .where(eq(stationCommandStates.stationId, stationId));
  },

  async markReserveDeploy(stationId: string, executedAt: Date, executor?: Database) {
    await getExecutor(executor)
      .update(stationCommandStates)
      .set({
        lastReserveDeployAt: executedAt
      })
      .where(eq(stationCommandStates.stationId, stationId));
  }
};
