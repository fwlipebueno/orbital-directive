import { sql } from "drizzle-orm";
import { bigint, datetime, index, json, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { stations } from "./stations";
import { users } from "./users";

export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
    stationId: varchar("station_id", { length: 36 }).references(() => stations.id, { onDelete: "set null" }),
    action: varchar("action", { length: 120 }).notNull(),
    resourceType: varchar("resource_type", { length: 80 }).notNull(),
    resourceId: varchar("resource_id", { length: 80 }),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 255 }),
    metadata: json("metadata"),
    createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`)
  },
  (table) => {
    return {
      userIndex: index("audit_logs_user_idx").on(table.userId, table.createdAt),
      stationIndex: index("audit_logs_station_idx").on(table.stationId, table.createdAt)
    };
  }
);
