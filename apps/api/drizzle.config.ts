import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

const envCandidates = [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")];

for (const filePath of envCandidates) {
  if (existsSync(filePath)) {
    config({ path: filePath, override: false });
  }
}

export default defineConfig({
  out: "./src/db/migrations",
  schema: "./src/db/schema/*.ts",
  dialect: "mysql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? ""
  },
  strict: true,
  verbose: true
});
