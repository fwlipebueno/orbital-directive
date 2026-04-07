import {
  commandActionInputSchema,
  loginInputSchema,
  moduleRepairInputSchema,
  moduleToggleInputSchema,
  moduleUpgradeInputSchema,
  registerInputSchema,
  researchUpgradeInputSchema,
  stationStateSchema
} from "@orbital/shared";
import { z } from "zod";
import { webEnv } from "./env";
import { trpcMutation, trpcQuery } from "./trpc";

const authMeSchema = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
    createdAt: z.string(),
    isDemo: z.boolean()
  }),
  preferences: z.object({
    reducedSensoryMode: z.boolean(),
    compactDensity: z.boolean()
  })
});

const authResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().email(),
    createdAt: z.string()
  })
});

const logEntrySchema = z.object({
  id: z.string(),
  type: z.string(),
  message: z.string(),
  payload: z.unknown().optional(),
  createdAt: z.string()
});

const runSummarySchema = z.object({
  id: z.union([z.string(), z.number()]),
  stationId: z.string(),
  tickSeconds: z.number(),
  incidentCount: z.number(),
  severity: z.string(),
  criticalResources: z.array(z.string()),
  createdAt: z.union([z.string(), z.date()])
});

const researchEntrySchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
  level: z.number(),
  maxLevel: z.number(),
  nextCost: z.number().nullable()
});

const preferencesSchema = z.object({
  reducedSensoryMode: z.boolean(),
  compactDensity: z.boolean()
});

const commandUpdateInputSchema = z.object({
  stationId: z.string().min(1),
  powerProfile: z.enum(["balanced", "lifeSupport", "research", "shielded"]),
  subsystemFocus: z.enum(["balanced", "integrity", "research", "morale"]),
  thermalPolicy: z.enum(["nominal", "economy", "boost"])
});

const healthSchema = z.object({
  ok: z.literal(true),
  ts: z.string()
});

export const api = {
  async health() {
    const response = await fetch(`${webEnv.apiOrigin}/api/health`, {
      method: "GET",
      credentials: "include"
    });

    if (!response.ok) {
      throw new Error(`Healthcheck failed with status ${response.status}`);
    }

    const payload = (await response.json()) as unknown;
    return healthSchema.parse(payload);
  },

  async me() {
    const raw = await trpcQuery<unknown>("auth.me");
    return authMeSchema.parse(raw);
  },

  async login(input: unknown) {
    const payload = loginInputSchema.parse(input);
    const raw = await trpcMutation<unknown>("auth.login", payload);
    return authResponseSchema.parse(raw);
  },

  async register(input: unknown) {
    const payload = registerInputSchema.parse(input);
    const raw = await trpcMutation<unknown>("auth.register", payload);
    return authResponseSchema.parse(raw);
  },

  async demoLogin() {
    const raw = await trpcMutation<unknown>("auth.demoLogin");
    return authResponseSchema.parse(raw);
  },

  async logout() {
    return trpcMutation<{ ok: boolean }>("auth.logout");
  },

  async currentStation() {
    const raw = await trpcQuery<unknown>("stations.current");
    return stationStateSchema.parse(raw);
  },

  async stationById(stationId: string) {
    const raw = await trpcQuery<unknown>("stations.byId", { stationId });
    return stationStateSchema.parse(raw);
  },

  async runSummaries(stationId: string) {
    const raw = await trpcQuery<unknown>("stations.runSummaries", { stationId });
    return z.array(runSummarySchema).parse(raw);
  },

  async listLogs(stationId: string, limit = 80) {
    const raw = await trpcQuery<unknown>("logs.list", { stationId, limit });
    return z.array(logEntrySchema).parse(raw);
  },

  async listResearch(stationId: string) {
    const raw = await trpcQuery<unknown>("research.list", { stationId });
    return z.array(researchEntrySchema).parse(raw);
  },

  async upgradeModule(input: unknown) {
    const payload = moduleUpgradeInputSchema.parse(input);
    return trpcMutation("modules.upgrade", payload);
  },

  async repairModule(input: unknown) {
    const payload = moduleRepairInputSchema.parse(input);
    return trpcMutation("modules.repair", payload);
  },

  async toggleModule(input: unknown) {
    const payload = moduleToggleInputSchema.parse(input);
    return trpcMutation("modules.toggle", payload);
  },

  async resolveIncident(input: unknown) {
    const payload = z
      .object({
        stationId: z.string(),
        incidentId: z.string(),
        idempotencyKey: z.string().uuid()
      })
      .parse(input);
    return trpcMutation("incidents.resolve", payload);
  },

  async purchaseResearch(input: unknown) {
    const payload = researchUpgradeInputSchema.parse(input);
    return trpcMutation("research.purchase", payload);
  },

  async updatePreferences(input: { reducedSensoryMode: boolean; compactDensity: boolean }) {
    const raw = await trpcMutation<unknown>("users.updatePreferences", input);
    return preferencesSchema.parse(raw);
  },

  async resetStation(stationId: string, idempotencyKey: string) {
    return trpcMutation("stations.reset", {
      stationId,
      idempotencyKey,
      confirmationText: "RESET"
    });
  },

  async updateCommandState(input: unknown) {
    const payload = commandUpdateInputSchema.parse(input);
    return trpcMutation("stations.updateCommandState", payload);
  },

  async executeOrbitalBurn(input: unknown) {
    const payload = commandActionInputSchema.parse(input);
    return trpcMutation("stations.orbitalBurn", payload);
  },

  async deployEmergencyReserve(input: unknown) {
    const payload = commandActionInputSchema.parse(input);
    return trpcMutation("stations.deployReserve", payload);
  }
};

export type AuthMe = z.infer<typeof authMeSchema>;
