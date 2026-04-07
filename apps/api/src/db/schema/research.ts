import { sql } from "drizzle-orm";
import { datetime, int, mysqlTable, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { stations } from "./stations";

export const stationResearchUpgrades = mysqlTable(
  "station_research_upgrades",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    stationId: varchar("station_id", { length: 36 })
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    upgradeKey: varchar("upgrade_key", { length: 64 }).notNull(),
    level: int("level", { unsigned: true }).notNull().default(0),
    createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: datetime("updated_at", { mode: "date", fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdateFn(() => new Date())
  },
  (table) => {
    return {
      stationUpgradeUnique: uniqueIndex("station_research_upgrades_station_key_unique").on(table.stationId, table.upgradeKey)
    };
  }
);
