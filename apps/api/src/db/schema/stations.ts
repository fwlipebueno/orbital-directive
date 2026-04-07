import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  datetime,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  uniqueIndex,
  varchar
} from "drizzle-orm/mysql-core";
import { users } from "./users";

export const stations = mysqlTable(
  "stations",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    version: int("version", { unsigned: true }).notNull().default(1),
    lastProcessedAt: datetime("last_processed_at", { mode: "date", fsp: 3 }).notNull(),
    createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: datetime("updated_at", { mode: "date", fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdateFn(() => new Date())
  },
  (table) => {
    return {
      stationUserUnique: uniqueIndex("stations_user_id_unique").on(table.userId)
    };
  }
);

export const stationResources = mysqlTable("station_resources", {
  stationId: varchar("station_id", { length: 36 })
    .primaryKey()
    .references(() => stations.id, { onDelete: "cascade" }),
  energy: decimal("energy", { precision: 12, scale: 3 }).notNull(),
  oxygen: decimal("oxygen", { precision: 12, scale: 3 }).notNull(),
  water: decimal("water", { precision: 12, scale: 3 }).notNull(),
  food: decimal("food", { precision: 12, scale: 3 }).notNull(),
  credits: decimal("credits", { precision: 14, scale: 3 }).notNull(),
  research: decimal("research", { precision: 14, scale: 3 }).notNull(),
  hullIntegrity: decimal("hull_integrity", { precision: 12, scale: 3 }).notNull(),
  morale: decimal("morale", { precision: 12, scale: 3 }).notNull(),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`)
    .$onUpdateFn(() => new Date())
});

export const stationModules = mysqlTable(
  "station_modules",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    stationId: varchar("station_id", { length: 36 })
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    moduleType: varchar("module_type", { length: 32 }).notNull(),
    level: int("level", { unsigned: true }).notNull().default(1),
    health: decimal("health", { precision: 5, scale: 2 }).notNull().default("100"),
    isOnline: boolean("is_online").notNull().default(true),
    createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: datetime("updated_at", { mode: "date", fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdateFn(() => new Date())
  },
  (table) => {
    return {
      stationModuleUnique: uniqueIndex("station_modules_station_type_unique").on(table.stationId, table.moduleType),
      stationIdIndex: index("station_modules_station_id_idx").on(table.stationId)
    };
  }
);

export const stationIncidents = mysqlTable(
  "station_incidents",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    stationId: varchar("station_id", { length: 36 })
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    incidentType: varchar("incident_type", { length: 48 }).notNull(),
    severity: int("severity", { unsigned: true }).notNull(),
    status: mysqlEnum("status", ["open", "resolved"]).notNull().default("open"),
    startedAt: datetime("started_at", { mode: "date", fsp: 3 }).notNull(),
    endsAt: datetime("ends_at", { mode: "date", fsp: 3 }),
    resolvedAt: datetime("resolved_at", { mode: "date", fsp: 3 }),
    metadata: json("metadata"),
    createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: datetime("updated_at", { mode: "date", fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdateFn(() => new Date())
  },
  (table) => {
    return {
      stationOpenIncidentIndex: index("station_incidents_station_status_idx").on(table.stationId, table.status)
    };
  }
);

export const stationLogs = mysqlTable(
  "station_logs",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    stationId: varchar("station_id", { length: 36 })
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    logType: mysqlEnum("log_type", ["event", "action", "audit", "system"]).notNull(),
    message: varchar("message", { length: 400 }).notNull(),
    payload: json("payload"),
    createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`)
  },
  (table) => {
    return {
      stationLogsStationIndex: index("station_logs_station_idx").on(table.stationId, table.createdAt)
    };
  }
);

export const stationRunSummaries = mysqlTable(
  "station_run_summaries",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    stationId: varchar("station_id", { length: 36 })
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    tickSeconds: int("tick_seconds", { unsigned: true }).notNull(),
    incidentCount: int("incident_count", { unsigned: true }).notNull(),
    severity: varchar("severity", { length: 16 }).notNull(),
    criticalResources: json("critical_resources").notNull(),
    createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`)
  },
  (table) => {
    return {
      stationRunSummaryIndex: index("station_run_summaries_station_idx").on(table.stationId, table.createdAt)
    };
  }
);

export const stationCommandStates = mysqlTable("station_command_states", {
  stationId: varchar("station_id", { length: 36 })
    .primaryKey()
    .references(() => stations.id, { onDelete: "cascade" }),
  powerProfile: mysqlEnum("power_profile", ["balanced", "lifeSupport", "research", "shielded"])
    .notNull()
    .default("balanced"),
  subsystemFocus: mysqlEnum("subsystem_focus", ["balanced", "integrity", "research", "morale"])
    .notNull()
    .default("balanced"),
  thermalPolicy: mysqlEnum("thermal_policy", ["nominal", "economy", "boost"]).notNull().default("nominal"),
  lastOrbitalBurnAt: datetime("last_orbital_burn_at", { mode: "date", fsp: 3 }),
  lastReserveDeployAt: datetime("last_reserve_deploy_at", { mode: "date", fsp: 3 }),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`)
    .$onUpdateFn(() => new Date())
});

export const stationRelations = relations(stations, ({ one, many }) => ({
  user: one(users, {
    fields: [stations.userId],
    references: [users.id]
  }),
  resources: one(stationResources, {
    fields: [stations.id],
    references: [stationResources.stationId]
  }),
  modules: many(stationModules),
  incidents: many(stationIncidents),
  logs: many(stationLogs),
  runSummaries: many(stationRunSummaries),
  commandState: one(stationCommandStates, {
    fields: [stations.id],
    references: [stationCommandStates.stationId]
  })
}));
