import { RESEARCH_UPGRADES, getResearchUpgradeCost, type ResearchUpgradeKey } from "@orbital/shared";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { auditRepository } from "../../db/repositories/audit-repository";
import { researchRepository } from "../../db/repositories/research-repository";
import { stationRepository } from "../../db/repositories/station-repository";
import { stationResources, stations } from "../../db/schema";
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

export const researchService = {
  async purchaseUpgrade(
    userId: string,
    stationId: string,
    upgradeKey: ResearchUpgradeKey,
    idempotencyKey: string,
    meta?: ActionMeta
  ) {
    assertUserCriticalRateLimit(userId, `research:${upgradeKey}`);

    await stationSimulationService.processAndGetState(stationId, userId);

    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM stations WHERE id = ${stationId} FOR UPDATE`);
      const station = await stationRepository.findByIdAndUser(stationId, userId, tx);
      if (!station) {
        throw new AppError("Station not found.", "STATION_NOT_FOUND", 404);
      }

      return idempotencyService.run({
        userId,
        action: `research.upgrade.${upgradeKey}`,
        idempotencyKey,
        executor: tx,
        run: async () => {
          const config = RESEARCH_UPGRADES[upgradeKey];
          const existing = await researchRepository.findByStationAndKey(stationId, upgradeKey, tx);
          const currentLevel = existing?.level ?? 0;
          if (currentLevel >= config.maxLevel) {
            throw new AppError("Research upgrade already maxed.", "RESEARCH_MAX_LEVEL", 400);
          }

          const cost = getResearchUpgradeCost(currentLevel, config.baseCostResearch);
          const resources = await stationRepository.getResources(stationId, tx);
          if (!resources) {
            throw new AppError("Station resources unavailable.", "STATION_RESOURCES_NOT_FOUND", 500);
          }

          const currentResearch = asNumber(resources.research);
          if (currentResearch < cost) {
            throw new AppError("Not enough research points.", "INSUFFICIENT_RESEARCH", 409);
          }

          await tx
            .update(stationResources)
            .set({
              research: String(currentResearch - cost)
            })
            .where(eq(stationResources.stationId, stationId));

          await researchRepository.upsert(stationId, upgradeKey, currentLevel + 1, tx);

          await tx
            .update(stations)
            .set({
              version: sql`${stations.version} + 1`
            })
            .where(eq(stations.id, stationId));

          await stationRepository.appendLog(
            stationId,
            "action",
            `Research upgrade ${upgradeKey} advanced to level ${currentLevel + 1}`,
            { cost },
            tx
          );

          await auditRepository.append(
            {
              userId,
              stationId,
              action: "research.upgrade",
              resourceType: "research_upgrade",
              resourceId: upgradeKey,
              ipAddress: meta?.ipAddress,
              userAgent: meta?.userAgent,
              metadata: {
                upgradeKey,
                previousLevel: currentLevel,
                nextLevel: currentLevel + 1,
                cost
              }
            },
            tx
          );

          return {
            ok: true,
            upgradeKey,
            level: currentLevel + 1,
            cost
          };
        }
      });
    });
  },

  async listUpgrades(stationId: string, userId: string) {
    const station = await stationRepository.findByIdAndUser(stationId, userId);
    if (!station) {
      throw new AppError("Station not found.", "STATION_NOT_FOUND", 404);
    }

    const upgrades = await researchRepository.listByStation(stationId);
    const upgradeMap = new Map(upgrades.map((upgrade) => [upgrade.upgradeKey, upgrade.level]));

    return Object.entries(RESEARCH_UPGRADES).map(([upgradeKey, config]) => {
      const level = upgradeMap.get(upgradeKey) ?? 0;
      return {
        key: upgradeKey,
        label: config.label,
        description: config.description,
        level,
        maxLevel: config.maxLevel,
        nextCost: level >= config.maxLevel ? null : getResearchUpgradeCost(level, config.baseCostResearch)
      };
    });
  }
};
