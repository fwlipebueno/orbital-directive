import { migrate } from "drizzle-orm/mysql2/migrator";
import { db, pool } from "../src/db/client";

async function run() {
  await migrate(db, {
    migrationsFolder: "./src/db/migrations"
  });
}

run()
  .then(async () => {
    await pool.end();
    console.log("Migrations applied successfully.");
  })
  .catch(async (error) => {
    console.error("Migration failed", error);
    await pool.end();
    process.exit(1);
  });
