import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { env } from "../config/env";
import * as schema from "./schema";

const pool = mysql.createPool({
  uri: env.DATABASE_URL,
  connectionLimit: 10,
  decimalNumbers: true
});

export const db = drizzle(pool, { schema, mode: "default" });
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Database = typeof db | DbTransaction;
export { pool };
