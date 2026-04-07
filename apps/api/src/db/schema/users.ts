import { relations, sql } from "drizzle-orm";
import { boolean, datetime, index, mysqlTable, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable(
  "users",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    email: varchar("email", { length: 180 }).notNull(),
    name: varchar("name", { length: 60 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: datetime("updated_at", { mode: "date", fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdateFn(() => new Date())
  },
  (table) => {
    return {
      emailUnique: uniqueIndex("users_email_unique").on(table.email)
    };
  }
);

export const sessions = mysqlTable(
  "sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 255 }),
    createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    expiresAt: datetime("expires_at", { mode: "date", fsp: 3 }).notNull(),
    lastUsedAt: datetime("last_used_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    revokedAt: datetime("revoked_at", { mode: "date", fsp: 3 })
  },
  (table) => {
    return {
      tokenHashUnique: uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
      userIdIndex: index("sessions_user_id_idx").on(table.userId)
    };
  }
);

export const userPreferences = mysqlTable("user_preferences", {
  userId: varchar("user_id", { length: 36 })
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  reducedSensoryMode: boolean("reduced_sensory_mode").notNull().default(false),
  compactDensity: boolean("compact_density").notNull().default(false),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`)
    .$onUpdateFn(() => new Date())
});

export const userRelations = relations(users, ({ many, one }) => ({
  sessions: many(sessions),
  preferences: one(userPreferences, {
    fields: [users.id],
    references: [userPreferences.userId]
  })
}));
