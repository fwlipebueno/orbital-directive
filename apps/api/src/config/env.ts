import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { z } from "zod";

const envCandidates = [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")];

for (const filePath of envCandidates) {
  if (existsSync(filePath)) {
    config({ path: filePath, override: false });
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  APP_ORIGIN: z.string().url().default("http://localhost:5173"),
  API_ORIGIN: z.string().url().default("http://localhost:4000"),
  DATABASE_URL: z.string().min(1),
  SESSION_COOKIE_NAME: z.string().min(1).default("orbital_session"),
  SESSION_COOKIE_SECURE: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  SESSION_COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(168),
  SESSION_SECRET: z.string().min(24),
  CSRF_COOKIE_NAME: z.string().min(1).default("orbital_csrf"),
  CSRF_HEADER_NAME: z.string().min(1).default("x-csrf-token"),
  CSP_CONNECT_SRC: z.string().default("self http://localhost:4000"),
  CSP_IMG_SRC: z.string().default("self data:"),
  CSP_MEDIA_SRC: z.string().default("self"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().min(1).default(20),
  RATE_LIMIT_CRITICAL_MAX: z.coerce.number().int().min(1).default(15),
  DEMO_EMAIL: z.string().email().default("demo@orbital.directive"),
  DEMO_PASSWORD: z.string().min(12).default("DemoPass123!"),
  DEMO_USER_NAME: z.string().min(3).default("Commander Demo"),
  IDEMPOTENCY_TTL_MINUTES: z.coerce.number().int().min(1).default(30)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

const env = parsed.data;

export { env };

