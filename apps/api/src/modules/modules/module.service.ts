import { getModuleRepairCost, getModuleUpgradeCost } from "@orbital/shared";
import type { ModuleType } from "@orbital/shared";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { auditRepository } from "../../db/repositories/audit-repository";
import { stationRepository } from "../../db/repositories/station-repository";
import { stationModules, stationResources, stations } from "../../db/schema";
import { idempotencyService } from "../../services/idempotency-service";
import { stationSimulationService } from "../../services/station-simulation-service";
import { assertUserCriticalRateLimit } from "../../security/rate-limit";
import { AppError } from "../../utils/errors";

interface ActionMeta {
  ipAddress?: string;
  userAgent?: string;
}

function asNumber(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

export const moduleService = {
  async upgradeModule(userId: string, stationId: string, moduleType: ModuleType, idempotencyKey: string, meta?: ActionMeta) {
    assertUserCriticalRateLimit(userId, `upgrade:${moduleType}`);

    await stationSimulationService.processAndGetState(stationId, userId);

    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM stations WHERE id = ${stationId} FOR UPDATE`);
      const station = await stationRepository.findByIdAndUser(stationId, userId, tx);
      if (!station) {
        throw new AppError("Station not found.", "STATION_NOT_FOUND", 404);
      }

      return idempotencyService.run({
        userId,
        action: `module.upgrade.${moduleType}`,
        idempotencyKey,
        executor: tx,
        run: async () => {
          const resources = await stationRepository.getResources(stationId, tx);
          const modules = await stationRepository.getModules(stationId, tx);
          const target = modules.find((module) => module.moduleType === moduleType);
          if (!resources || !target) {
            throw new AppError("Module data unavailable.", "MODULE_NOT_FOUND", 404);
          }

          const currentCredits = asNumber(resources.credits);
          const upgradeCost = getModuleUpgradeCost(moduleType, target.level);
          if (!Number.isFinite(upgradeCost)) {
            throw new AppError("Module already at max level.", "MODULE_MAX_LEVEL", 400);
          }
          if (currentCredits < upgradeCost) {
            throw new AppError("Not enough credits for upgrade.", "INSUFFICIENT_CREDITS", 409);
          }

          await tx
            .update(stationModules)
            .set({
              level: target.level + 1,
              health: "100"
            })
            .where(and(eq(stationModules.stationId, stationId), eq(stationModules.moduleType, moduleType)));

          await tx
            .update(stationResources)
            .set({
              credits: String(currentCredits - upgradeCost)
            })
            .where(eq(stationResources.stationId, stationId));

          await tx
            .update(stations)
            .set({
              version: sql`${stations.version} + 1`
            })
            .where(eq(stations.id, stationId));

          await stationRepository.appendLog(
            stationId,
            "action",
            `Module ${moduleType} upgraded to level ${target.level + 1}`,
            { cost: upgradeCost },
            tx
          );

          await auditRepository.append(
            {
              userId,
              stationId,
              action: "module.upgrade",
              resourceType: "station_module",
              resourceId: target.id,
              ipAddress: meta?.ipAddress,
              userAgent: meta?.userAgent,
              metadata: {
                moduleType,
                previousLevel: target.level,
                nextLevel: target.level + 1,
                cost: upgradeCost
              }
            },
            tx
          );

          return {
            ok: true,
            moduleType,
            level: target.level + 1,
            cost: upgradeCost
          };
        }
      });
    });
  },

  async repairModule(userId: string, stationId: string, moduleType: ModuleType, idempotencyKey: string, meta?: ActionMeta) {
    assertUserCriticalRateLimit(userId, `repair:${moduleType}`);

    await stationSimulationService.processAndGetState(stationId, userId);

    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM stations WHERE id = ${stationId} FOR UPDATE`);
      const station = await stationRepository.findByIdAndUser(stationId, userId, tx);
      if (!station) {
        throw new AppError("Station not found.", "STATION_NOT_FOUND", 404);
      }

      return idempotencyService.run({
        userId,
        action: `module.repair.${moduleType}`,
        idempotencyKey,
        executor: tx,
        run: async () => {
          const resources = await stationRepository.getResources(stationId, tx);
          const modules = await stationRepository.getModules(stationId, tx);
          const target = modules.find((module) => module.moduleType === moduleType);
          if (!resources || !target) {
            throw new AppError("Module data unavailable.", "MODULE_NOT_FOUND", 404);
          }

          const repairCost = getModuleRepairCost(moduleType, asNumber(target.health));
          if (repairCost <= 0) {
            return {
              ok: true,
              moduleType,
              level: target.level,
              cost: 0,
              health: asNumber(target.health)
            };
          }

          const currentCredits = asNumber(resources.credits);
          if (currentCredits < repairCost) {
            throw new AppError("Not enough credits for repair.", "INSUFFICIENT_CREDITS", 409);
          }

          await tx
            .update(stationModules)
            .set({
              health: "100"
            })
            .where(and(eq(stationModules.stationId, stationId), eq(stationModules.moduleType, moduleType)));

          await tx
            .update(stationResources)
            .set({
              credits: String(currentCredits - repairCost)
            })
            .where(eq(stationResources.stationId, stationId));

          await tx
            .update(stations)
            .set({
              version: sql`${stations.version} + 1`
            })
            .where(eq(stations.id, stationId));

          await stationRepository.appendLog(
            stationId,
            "action",
            `Module ${moduleType} fully repaired`,
            { cost: repairCost },
            tx
          );

          await auditRepository.append(
            {
              userId,
              stationId,
              action: "module.repair",
              resourceType: "station_module",
              resourceId: target.id,
              ipAddress: meta?.ipAddress,
              userAgent: meta?.userAgent,
              metadata: {
                moduleType,
                previousHealth: asNumber(target.health),
                nextHealth: 100,
                cost: repairCost
              }
            },
            tx
          );

          return {
            ok: true,
            moduleType,
            level: target.level,
            cost: repairCost,
            health: 100
          };
        }
      });
    });
  },

  async toggleModule(userId: string, stationId: string, moduleType: ModuleType, isOnline: boolean, meta?: ActionMeta) {
    assertUserCriticalRateLimit(userId, `toggle:${moduleType}`);
    await stationSimulationService.processAndGetState(stationId, userId);

    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM stations WHERE id = ${stationId} FOR UPDATE`);
      const station = await stationRepository.findByIdAndUser(stationId, userId, tx);
      if (!station) {
        throw new AppError("Station not found.", "STATION_NOT_FOUND", 404);
      }

      const modules = await stationRepository.getModules(stationId, tx);
      const target = modules.find((module) => module.moduleType === moduleType);
      if (!target) {
        throw new AppError("Module not found.", "MODULE_NOT_FOUND", 404);
      }

      await tx
        .update(stationModules)
        .set({
          isOnline
        })
        .where(and(eq(stationModules.stationId, stationId), eq(stationModules.moduleType, moduleType)));

      await tx
        .update(stations)
        .set({
          version: sql`${stations.version} + 1`
        })
        .where(eq(stations.id, stationId));

      await stationRepository.appendLog(
        stationId,
        "action",
        `Module ${moduleType} ${isOnline ? "enabled" : "disabled"}`,
        undefined,
        tx
      );

      await auditRepository.append(
        {
          userId,
          stationId,
          action: "module.toggle",
          resourceType: "station_module",
          resourceId: target.id,
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
          metadata: {
            moduleType,
            isOnline
          }
        },
        tx
      );
    });

    return { ok: true };
  }
};
