export const resourceTypes = [
  "energy",
  "oxygen",
  "water",
  "food",
  "credits",
  "research",
  "hullIntegrity",
  "morale"
] as const;

export type ResourceType = (typeof resourceTypes)[number];

export const moduleTypes = [
  "reactor",
  "solarArray",
  "lifeSupport",
  "hydroponics",
  "researchLab",
  "repairBay"
] as const;

export type ModuleType = (typeof moduleTypes)[number];

export const incidentTypes = [
  "solarFlare",
  "coolantLeak",
  "oxygenLeak",
  "reactorInstability",
  "crewIllness",
  "communicationsBlackout"
] as const;

export type IncidentType = (typeof incidentTypes)[number];

export const stationSeverityStates = ["normal", "attention", "alert", "crisis"] as const;

export type StationSeverityState = (typeof stationSeverityStates)[number];

export const powerProfiles = ["balanced", "lifeSupport", "research", "shielded"] as const;

export type PowerProfile = (typeof powerProfiles)[number];

export const subsystemFocusModes = ["balanced", "integrity", "research", "morale"] as const;

export type SubsystemFocusMode = (typeof subsystemFocusModes)[number];

export const thermalPolicies = ["nominal", "economy", "boost"] as const;

export type ThermalPolicy = (typeof thermalPolicies)[number];
