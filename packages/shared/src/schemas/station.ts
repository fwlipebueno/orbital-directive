import { z } from "zod";
import {
  incidentTypes,
  moduleTypes,
  powerProfiles,
  resourceTypes,
  stationSeverityStates,
  subsystemFocusModes,
  thermalPolicies
} from "../enums/game";

const resourceEnum = z.enum(resourceTypes);
const moduleEnum = z.enum(moduleTypes);
const incidentEnum = z.enum(incidentTypes);
const severityEnum = z.enum(stationSeverityStates);

export const resourceSnapshotSchema = z.record(resourceEnum, z.number());

export const stationModuleSchema = z.object({
  id: z.string(),
  type: moduleEnum,
  level: z.number().int().min(1),
  health: z.number().min(0).max(100),
  isOnline: z.boolean()
});

export const incidentSchema = z.object({
  id: z.string(),
  type: incidentEnum,
  severity: z.number().int().min(1).max(3),
  status: z.enum(["open", "resolved"]),
  startedAt: z.string(),
  resolvedAt: z.string().nullable()
});

export const runSummarySchema = z.object({
  tickSeconds: z.number().int().nonnegative(),
  incidentCount: z.number().int().nonnegative(),
  criticalResources: z.array(resourceEnum),
  severity: severityEnum
});

export const missionTelemetrySchema = z.object({
  solarExposure: z.number().min(0).max(2),
  orbitalStability: z.number().min(0).max(100),
  thermalLoad: z.number().min(0).max(100),
  hullPressure: z.number().min(0).max(100),
  deltaVWindow: z.enum(["open", "narrow", "closed"]),
  operationalRisk: z.enum(["low", "moderate", "high", "critical"])
});

export const stationCommandStateSchema = z.object({
  powerProfile: z.enum(powerProfiles),
  subsystemFocus: z.enum(subsystemFocusModes),
  thermalPolicy: z.enum(thermalPolicies),
  lastOrbitalBurnAt: z.string().nullable(),
  lastReserveDeployAt: z.string().nullable(),
  orbitalBurn: z.object({
    ready: z.boolean(),
    cooldownSecondsRemaining: z.number().int().nonnegative(),
    energyCost: z.number().nonnegative(),
    creditsCost: z.number().nonnegative()
  }),
  emergencyReserve: z.object({
    ready: z.boolean(),
    cooldownSecondsRemaining: z.number().int().nonnegative(),
    creditsCost: z.number().nonnegative()
  })
});

export const stationStateSchema = z.object({
  stationId: z.string(),
  stationName: z.string(),
  version: z.number().int().nonnegative(),
  lastProcessedAt: z.string(),
  resources: resourceSnapshotSchema,
  modules: z.array(stationModuleSchema),
  incidents: z.array(incidentSchema),
  openIncidentCount: z.number().int().nonnegative(),
  logs: z.array(
    z.object({
      id: z.string(),
      type: z.enum(["event", "action", "audit"]),
      message: z.string(),
      createdAt: z.string()
    })
  ),
  runSummary: runSummarySchema,
  missionTelemetry: missionTelemetrySchema,
  commandState: stationCommandStateSchema
});

export const stationPreferenceSchema = z.object({
  reducedSensoryMode: z.boolean().default(false),
  compactDensity: z.boolean().default(false)
});

export type StationState = z.infer<typeof stationStateSchema>;
