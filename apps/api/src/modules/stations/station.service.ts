import {
  COMMAND_ACTION_RULES,
  deriveMissionTelemetry,
  moduleTypes,
  type ModuleType,
  type CommandActionInput,
  type UpdateCommandStateInput,
  INITIAL_RESOURCES
} from "@orbital/shared";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { auditRepository } from "../../db/repositories/audit-repository";
import { researchRepository } from "../../db/repositories/research-repository";
import { stationRepository } from "../../db/repositories/station-repository";
import {
  stationCommandStates,
  stationIncidents,
  stationModules,
  stationResources,
  stationResearchUpgrades,
  stationRunSummaries,
  stations
} from "../../db/schema";
import { idempotencyService } from "../../services/idempotency-service";
import { stationSimulationService } from "../../services/station-simulation-service";
import { assertUserCriticalRateLimit } from "../../security/rate-limit";
import { AppError } from "../../utils/errors";

export const stationService = {
  async ensureUserStation(userId: string, name = "Orbital Directive Core") {
    const existing = await stationRepository.findByUserId(userId);
    if (existing) {
      return existing;
    }

    const stationId = randomUUID();
    const now = new Date();
    await stationRepository.createStationWithDefaults({
      id: stationId,
      userId,
      name,
      now
    });

    return stationRepository.findByIdAndUser(stationId, userId);
  },

  async getCurrentStationState(userId: string) {
    const station = await this.ensureUserStation(userId);
    if (!station) {
      throw new AppError("Unable to initialize station.", "STATION_INIT_ERROR", 500);
    }
    return stationSimulationService.processAndGetState(station.id, userId);
  },

  async getStationState(stationId: string, userId: string) {
    return stationSimulationService.processAndGetState(stationId, userId);
  },

  async listRunSummaries(stationId: string, userId: string) {
    const station = await stationRepository.findByIdAndUser(stationId, userId);
    if (!station) {
      throw new AppError("Station not found.", "STATION_NOT_FOUND", 404);
    }

    return stationRepository.getRecentRunSummaries(stationId, 30);
  },

  async resetStation(userId: string, stationId: string, idempotencyKey: string) {
    return db.transaction(async (tx) => {
      const station = await stationRepository.findByIdAndUser(stationId, userId, tx);
      if (!station) {
        throw new AppError("Station not found.", "STATION_NOT_FOUND", 404);
      }

      return idempotencyService.run({
        userId,
        action: "station.reset",
        idempotencyKey,
        executor: tx,
        run: async () => {
          await tx.execute(sql`SELECT id FROM stations WHERE id = ${stationId} FOR UPDATE`);

          await tx.delete(stationIncidents).where(eq(stationIncidents.stationId, stationId));
          await tx.delete(stationModules).where(eq(stationModules.stationId, stationId));
          await tx.delete(stationResearchUpgrades).where(eq(stationResearchUpgrades.stationId, stationId));
          await tx.delete(stationRunSummaries).where(eq(stationRunSummaries.stationId, stationId));

          await tx
            .update(stationResources)
            .set({
              energy: String(INITIAL_RESOURCES.energy),
              oxygen: String(INITIAL_RESOURCES.oxygen),
              water: String(INITIAL_RESOURCES.water),
              food: String(INITIAL_RESOURCES.food),
              credits: String(INITIAL_RESOURCES.credits),
              research: String(INITIAL_RESOURCES.research),
              hullIntegrity: String(INITIAL_RESOURCES.hullIntegrity),
              morale: String(INITIAL_RESOURCES.morale)
            })
            .where(eq(stationResources.stationId, stationId));

          for (const moduleType of moduleTypes) {
            await tx.insert(stationModules).values({
              id: randomUUID(),
              stationId,
              moduleType,
              level: 1,
              health: "100",
              isOnline: true
            });
          }

          const now = new Date();
          await tx
            .update(stations)
            .set({
              version: sql`${stations.version} + 1`,
              lastProcessedAt: now
            })
            .where(and(eq(stations.id, stationId), eq(stations.userId, userId)));

          await stationRepository.ensureCommandState(stationId, tx);
          await stationRepository.updateCommandState(
            stationId,
            {
              powerProfile: "balanced",
              subsystemFocus: "balanced",
              thermalPolicy: "nominal"
            },
            tx
          );
          await tx
            .update(stationCommandStates)
            .set({
              lastOrbitalBurnAt: null,
              lastReserveDeployAt: null
            })
            .where(eq(stationCommandStates.stationId, stationId));

          await stationRepository.appendLog(stationId, "action", "Station reset executed", { reason: "manual reset" }, tx);
          return { ok: true, stationId };
        }
      });
    });
  },

  async getResearchUpgrades(stationId: string, userId: string) {
    const station = await stationRepository.findByIdAndUser(stationId, userId);
    if (!station) {
      throw new AppError("Station not found.", "STATION_NOT_FOUND", 404);
    }

    return researchRepository.listByStation(stationId);
  },

  async updateCommandState(userId: string, input: UpdateCommandStateInput, meta?: { ipAddress?: string; userAgent?: string }) {
    assertUserCriticalRateLimit(userId, "command.profile");
    await stationSimulationService.processAndGetState(input.stationId, userId);

    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM stations WHERE id = ${input.stationId} FOR UPDATE`);
      const station = await stationRepository.findByIdAndUser(input.stationId, userId, tx);
      if (!station) {
        throw new AppError("Station not found.", "STATION_NOT_FOUND", 404);
      }

      await stationRepository.ensureCommandState(input.stationId, tx);
      await stationRepository.updateCommandState(
        input.stationId,
        {
          powerProfile: input.powerProfile,
          subsystemFocus: input.subsystemFocus,
          thermalPolicy: input.thermalPolicy
        },
        tx
      );
      await tx
        .update(stations)
        .set({
          version: sql`${stations.version} + 1`
        })
        .where(eq(stations.id, input.stationId));

      await stationRepository.appendLog(
        input.stationId,
        "action",
        `Command profile updated: ${input.powerProfile} / ${input.subsystemFocus} / ${input.thermalPolicy}`,
        {
          powerProfile: input.powerProfile,
          subsystemFocus: input.subsystemFocus,
          thermalPolicy: input.thermalPolicy
        },
        tx
      );

      await auditRepository.append(
        {
          userId,
          stationId: input.stationId,
          action: "command.profile.update",
          resourceType: "station_command_state",
          resourceId: input.stationId,
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
          metadata: {
            powerProfile: input.powerProfile,
            subsystemFocus: input.subsystemFocus,
            thermalPolicy: input.thermalPolicy
          }
        },
        tx
      );

      return {
        ok: true
      };
    });
  },

  async executeOrbitalBurn(userId: string, input: CommandActionInput, meta?: { ipAddress?: string; userAgent?: string }) {
    assertUserCriticalRateLimit(userId, "command.orbital-burn");
    await stationSimulationService.processAndGetState(input.stationId, userId);

    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM stations WHERE id = ${input.stationId} FOR UPDATE`);
      const station = await stationRepository.findByIdAndUser(input.stationId, userId, tx);
      if (!station) {
        throw new AppError("Station not found.", "STATION_NOT_FOUND", 404);
      }

      return idempotencyService.run({
        userId,
        action: "command.orbital-burn",
        idempotencyKey: input.idempotencyKey,
        executor: tx,
        run: async () => {
          const commandState = await stationRepository.ensureCommandState(input.stationId, tx);
          const resources = await stationRepository.getResources(input.stationId, tx);
          const modules = await stationRepository.getModules(input.stationId, tx);
          const openIncidents = await stationRepository.getOpenIncidents(input.stationId, tx);

          if (!commandState || !resources) {
            throw new AppError("Command state unavailable.", "COMMAND_STATE_NOT_FOUND", 500);
          }

          const now = new Date();
          if (commandState.lastOrbitalBurnAt) {
            const cooldownUntil =
              commandState.lastOrbitalBurnAt.getTime() + COMMAND_ACTION_RULES.orbitalBurn.cooldownSeconds * 1000;
            if (cooldownUntil > now.getTime()) {
              throw new AppError("Orbital burn is cooling down.", "ORBITAL_BURN_COOLDOWN", 409);
            }
          }

          const telemetry = deriveMissionTelemetry({
            resources: {
              energy: Number(resources.energy),
              oxygen: Number(resources.oxygen),
              water: Number(resources.water),
              food: Number(resources.food),
              credits: Number(resources.credits),
              research: Number(resources.research),
              hullIntegrity: Number(resources.hullIntegrity),
              morale: Number(resources.morale)
            },
            modules: modules.map((module) => ({
              id: module.id,
              type: module.moduleType as ModuleType,
              level: module.level,
              health: Number(module.health),
              isOnline: module.isOnline
            })),
            openIncidents: openIncidents.length,
            nowMs: now.getTime()
          });

          if (telemetry.deltaVWindow === "closed") {
            throw new AppError("Delta-v window closed for orbital correction.", "ORBITAL_WINDOW_CLOSED", 409);
          }

          const nextEnergy = Number(resources.energy) - COMMAND_ACTION_RULES.orbitalBurn.energyCost;
          const nextCredits = Number(resources.credits) - COMMAND_ACTION_RULES.orbitalBurn.creditsCost;
          if (nextEnergy < 0) {
            throw new AppError("Insufficient energy for orbital burn.", "INSUFFICIENT_ENERGY", 409);
          }
          if (nextCredits < 0) {
            throw new AppError("Insufficient credits for orbital burn.", "INSUFFICIENT_CREDITS", 409);
          }

          await stationRepository.updateResources(
            input.stationId,
            {
              energy: nextEnergy,
              oxygen: Number(resources.oxygen),
              water: Number(resources.water),
              food: Number(resources.food),
              credits: nextCredits,
              research: Number(resources.research),
              hullIntegrity: Math.min(100, Number(resources.hullIntegrity) + 3.8),
              morale: Math.min(100, Number(resources.morale) + 1.2)
            },
            tx
          );
          await stationRepository.markOrbitalBurn(input.stationId, now, tx);
          await tx
            .update(stations)
            .set({
              version: sql`${stations.version} + 1`
            })
            .where(eq(stations.id, input.stationId));

          await stationRepository.appendLog(
            input.stationId,
            "action",
            "Orbital correction burn executed successfully.",
            {
              energyCost: COMMAND_ACTION_RULES.orbitalBurn.energyCost,
              creditsCost: COMMAND_ACTION_RULES.orbitalBurn.creditsCost
            },
            tx
          );

          await auditRepository.append(
            {
              userId,
              stationId: input.stationId,
              action: "command.orbital-burn",
              resourceType: "station_command_state",
              resourceId: input.stationId,
              ipAddress: meta?.ipAddress,
              userAgent: meta?.userAgent,
              metadata: {
                energyCost: COMMAND_ACTION_RULES.orbitalBurn.energyCost,
                creditsCost: COMMAND_ACTION_RULES.orbitalBurn.creditsCost,
                deltaVWindow: telemetry.deltaVWindow
              }
            },
            tx
          );

          return {
            ok: true
          };
        }
      });
    });
  },

  async deployEmergencyReserve(userId: string, input: CommandActionInput, meta?: { ipAddress?: string; userAgent?: string }) {
    assertUserCriticalRateLimit(userId, "command.emergency-reserve");
    await stationSimulationService.processAndGetState(input.stationId, userId);

    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM stations WHERE id = ${input.stationId} FOR UPDATE`);
      const station = await stationRepository.findByIdAndUser(input.stationId, userId, tx);
      if (!station) {
        throw new AppError("Station not found.", "STATION_NOT_FOUND", 404);
      }

      return idempotencyService.run({
        userId,
        action: "command.emergency-reserve",
        idempotencyKey: input.idempotencyKey,
        executor: tx,
        run: async () => {
          const commandState = await stationRepository.ensureCommandState(input.stationId, tx);
          const resources = await stationRepository.getResources(input.stationId, tx);
          if (!commandState || !resources) {
            throw new AppError("Command state unavailable.", "COMMAND_STATE_NOT_FOUND", 500);
          }

          const now = new Date();
          if (commandState.lastReserveDeployAt) {
            const cooldownUntil =
              commandState.lastReserveDeployAt.getTime() + COMMAND_ACTION_RULES.emergencyReserve.cooldownSeconds * 1000;
            if (cooldownUntil > now.getTime()) {
              throw new AppError("Emergency reserve is cooling down.", "EMERGENCY_RESERVE_COOLDOWN", 409);
            }
          }

          const nextCredits = Number(resources.credits) - COMMAND_ACTION_RULES.emergencyReserve.creditsCost;
          if (nextCredits < 0) {
            throw new AppError("Insufficient credits for emergency reserve.", "INSUFFICIENT_CREDITS", 409);
          }

          await stationRepository.updateResources(
            input.stationId,
            {
              energy: Number(resources.energy) + COMMAND_ACTION_RULES.emergencyReserve.grants.energy,
              oxygen: Number(resources.oxygen) + COMMAND_ACTION_RULES.emergencyReserve.grants.oxygen,
              water: Number(resources.water) + COMMAND_ACTION_RULES.emergencyReserve.grants.water,
              food: Number(resources.food),
              credits: nextCredits,
              research: Number(resources.research),
              hullIntegrity: Number(resources.hullIntegrity),
              morale: Number(resources.morale) + COMMAND_ACTION_RULES.emergencyReserve.grants.morale
            },
            tx
          );
          await stationRepository.markReserveDeploy(input.stationId, now, tx);
          await tx
            .update(stations)
            .set({
              version: sql`${stations.version} + 1`
            })
            .where(eq(stations.id, input.stationId));

          await stationRepository.appendLog(
            input.stationId,
            "action",
            "Emergency reserve package deployed.",
            {
              creditsCost: COMMAND_ACTION_RULES.emergencyReserve.creditsCost,
              grants: COMMAND_ACTION_RULES.emergencyReserve.grants
            },
            tx
          );

          await auditRepository.append(
            {
              userId,
              stationId: input.stationId,
              action: "command.emergency-reserve",
              resourceType: "station_command_state",
              resourceId: input.stationId,
              ipAddress: meta?.ipAddress,
              userAgent: meta?.userAgent,
              metadata: {
                creditsCost: COMMAND_ACTION_RULES.emergencyReserve.creditsCost,
                grants: COMMAND_ACTION_RULES.emergencyReserve.grants
              }
            },
            tx
          );

          return {
            ok: true
          };
        }
      });
    });
  }
};
