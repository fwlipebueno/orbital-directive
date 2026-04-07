import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, type Database } from "../client";
import { stationResearchUpgrades } from "../schema";

function getExecutor(executor?: Database): Database {
  return executor ?? db;
}

export const researchRepository = {
  async listByStation(stationId: string, executor?: Database) {
    return getExecutor(executor).query.stationResearchUpgrades.findMany({
      where: eq(stationResearchUpgrades.stationId, stationId)
    });
  },

  async findByStationAndKey(stationId: string, upgradeKey: string, executor?: Database) {
    return getExecutor(executor).query.stationResearchUpgrades.findFirst({
      where: and(eq(stationResearchUpgrades.stationId, stationId), eq(stationResearchUpgrades.upgradeKey, upgradeKey))
    });
  },

  async upsert(stationId: string, upgradeKey: string, level: number, executor?: Database) {
    const existing = await this.findByStationAndKey(stationId, upgradeKey, executor);
    if (!existing) {
      await getExecutor(executor).insert(stationResearchUpgrades).values({
        id: randomUUID(),
        stationId,
        upgradeKey,
        level
      });
      return this.findByStationAndKey(stationId, upgradeKey, executor);
    }

    await getExecutor(executor)
      .update(stationResearchUpgrades)
      .set({ level })
      .where(eq(stationResearchUpgrades.id, existing.id));

    return this.findByStationAndKey(stationId, upgradeKey, executor);
  }
};
