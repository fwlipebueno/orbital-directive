import { sql } from "drizzle-orm";
import { datetime, json, mysqlEnum, mysqlTable, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { users } from "./users";

export const idempotencyKeys = mysqlTable(
  "idempotency_keys",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 80 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 36 }).notNull(),
    status: mysqlEnum("status", ["pending", "completed"]).notNull().default("pending"),
    responseJson: json("response_json"),
    createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: datetime("updated_at", { mode: "date", fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdateFn(() => new Date())
  },
  (table) => {
    return {
      userActionKeyUnique: uniqueIndex("idempotency_user_action_key_unique").on(table.userId, table.action, table.idempotencyKey)
    };
  }
);
