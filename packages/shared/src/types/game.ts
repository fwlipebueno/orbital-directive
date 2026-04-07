import type {
  IncidentType,
  ModuleType,
  PowerProfile,
  ResourceType,
  StationSeverityState,
  SubsystemFocusMode,
  ThermalPolicy
} from "../enums/game";

export type ResourceSnapshot = Record<ResourceType, number>;

export interface StationModuleState {
  id: string;
  type: ModuleType;
  level: number;
  health: number;
  isOnline: boolean;
}

export interface ActiveIncidentState {
  id: string;
  type: IncidentType;
  severity: number;
  startedAtMs: number;
  endsAtMs: number | null;
}

export interface GeneratedIncident {
  type: IncidentType;
  severity: number;
  durationHours: number;
}

export interface SimulationInput {
  resources: ResourceSnapshot;
  modules: StationModuleState[];
  activeIncidents: ActiveIncidentState[];
  deltaSeconds: number;
  nowMs: number;
  commandState?: CommandDirectiveState;
  modifiers?: SimulationModifiers;
  rng: () => number;
}

export interface RunSummary {
  tickSeconds: number;
  incidentCount: number;
  criticalResources: ResourceType[];
  severity: StationSeverityState;
}

export type DeltaVWindow = "open" | "narrow" | "closed";
export type OperationalRisk = "low" | "moderate" | "high" | "critical";

export interface MissionTelemetry {
  solarExposure: number;
  orbitalStability: number;
  thermalLoad: number;
  hullPressure: number;
  deltaVWindow: DeltaVWindow;
  operationalRisk: OperationalRisk;
}

export interface SimulationOutput {
  resources: ResourceSnapshot;
  modules: StationModuleState[];
  generatedIncidents: GeneratedIncident[];
  expiredIncidentIds: string[];
  resourceDelta: ResourceSnapshot;
  logs: string[];
  runSummary: RunSummary;
}

export interface SimulationModifiers {
  productionMultiplier: number;
  consumptionMultiplier: number;
  incidentChanceMultiplier: number;
  moraleLossMultiplier: number;
  hullLossMultiplier: number;
}

export interface CommandDirectiveState {
  powerProfile: PowerProfile;
  subsystemFocus: SubsystemFocusMode;
  thermalPolicy: ThermalPolicy;
}
