import {
  CRITICAL_RESOURCE_THRESHOLDS,
  INCIDENT_DEFINITIONS,
  INCIDENT_SEVERITY_MULTIPLIER,
  MODULE_PASSIVE_WEAR_PER_HOUR,
  RESOURCE_MAX,
  RESOURCE_MIN,
  SIMULATION_MAX_DELTA_SECONDS,
  getModuleHourlyDelta
} from "../constants/game-balance";
import { incidentTypes, resourceTypes, stationSeverityStates } from "../enums/game";
import { deriveMissionTelemetry, getSolarExposure } from "./telemetry";
import type { IncidentType, ResourceType, StationSeverityState } from "../enums/game";
import type {
  ActiveIncidentState,
  GeneratedIncident,
  ResourceSnapshot,
  SimulationInput,
  SimulationModifiers,
  SimulationOutput,
  StationModuleState
} from "../types/game";

function clampResource(resourceType: ResourceType, value: number): number {
  const min = RESOURCE_MIN[resourceType];
  const max = RESOURCE_MAX[resourceType];
  return Math.min(max, Math.max(min, Number(value.toFixed(3))));
}

function clampHealth(value: number): number {
  return Math.min(100, Math.max(0, Number(value.toFixed(3))));
}

function applyResourceDelta(resources: ResourceSnapshot, delta: Partial<Record<ResourceType, number>>, factor = 1): void {
  for (const resourceType of resourceTypes) {
    const value = delta[resourceType];
    if (!value) {
      continue;
    }
    resources[resourceType] = clampResource(resourceType, resources[resourceType] + value * factor);
  }
}

function getDefaultModifiers(): SimulationModifiers {
  return {
    productionMultiplier: 1,
    consumptionMultiplier: 1,
    incidentChanceMultiplier: 1,
    moraleLossMultiplier: 1,
    hullLossMultiplier: 1
  };
}

function getAdjustedDelta(value: number, modifiers: SimulationModifiers): number {
  if (value < 0) {
    return value * modifiers.consumptionMultiplier;
  }
  return value * modifiers.productionMultiplier;
}

function applyModuleDamage(
  modules: StationModuleState[],
  damage: Partial<Record<StationModuleState["type"], number>>,
  factor = 1
): void {
  for (const module of modules) {
    const damagePerHour = damage[module.type];
    if (!damagePerHour) {
      continue;
    }
    module.health = clampHealth(module.health - damagePerHour * factor);
  }
}

function getSeverityFromResources(resources: ResourceSnapshot): StationSeverityState {
  if (
    resources.hullIntegrity <= 30 ||
    resources.oxygen <= 18 ||
    resources.energy <= 12 ||
    resources.morale <= 20
  ) {
    return "crisis";
  }
  if (
    resources.hullIntegrity <= 45 ||
    resources.oxygen <= 30 ||
    resources.energy <= 24 ||
    resources.morale <= 35
  ) {
    return "alert";
  }
  if (
    resources.hullIntegrity <= 65 ||
    resources.oxygen <= 45 ||
    resources.energy <= 40 ||
    resources.morale <= 55
  ) {
    return "attention";
  }
  return "normal";
}

function computeCriticalResources(resources: ResourceSnapshot): ResourceType[] {
  return resourceTypes.filter((resourceType) => resources[resourceType] <= CRITICAL_RESOURCE_THRESHOLDS[resourceType]);
}

function rollSeverity(rng: () => number): 1 | 2 | 3 {
  const roll = rng();
  if (roll > 0.85) {
    return 3;
  }
  if (roll > 0.5) {
    return 2;
  }
  return 1;
}

function rollDurationHours(type: IncidentType, rng: () => number): number {
  const [minDuration, maxDuration] = INCIDENT_DEFINITIONS[type].baseDurationHours;
  const spread = maxDuration - minDuration;
  return Number((minDuration + spread * rng()).toFixed(2));
}

function buildZeroDelta(resources: ResourceSnapshot): ResourceSnapshot {
  return Object.fromEntries(resourceTypes.map((resourceType) => [resourceType, 0])) as ResourceSnapshot;
}

function copyResources(resources: ResourceSnapshot): ResourceSnapshot {
  return { ...resources };
}

function copyModules(modules: StationModuleState[]): StationModuleState[] {
  return modules.map((module) => ({ ...module }));
}

function applyScarcityPenalties(resources: ResourceSnapshot, deltaHours: number, modifiers: SimulationModifiers): void {
  if (resources.energy <= 0) {
    resources.hullIntegrity = clampResource("hullIntegrity", resources.hullIntegrity - 2 * deltaHours * modifiers.hullLossMultiplier);
    resources.morale = clampResource("morale", resources.morale - 3.4 * deltaHours * modifiers.moraleLossMultiplier);
  }
  if (resources.oxygen < 20) {
    resources.hullIntegrity = clampResource("hullIntegrity", resources.hullIntegrity - 1.2 * deltaHours * modifiers.hullLossMultiplier);
    resources.morale = clampResource("morale", resources.morale - 2.7 * deltaHours * modifiers.moraleLossMultiplier);
  }
  if (resources.water < 15) {
    resources.morale = clampResource("morale", resources.morale - 2 * deltaHours * modifiers.moraleLossMultiplier);
  }
  if (resources.food < 15) {
    resources.morale = clampResource("morale", resources.morale - 1.5 * deltaHours * modifiers.moraleLossMultiplier);
  }
  if (resources.morale < 25) {
    resources.research = clampResource("research", resources.research - 2.8 * deltaHours);
  }
}

function applyPassiveModuleEffects(
  modules: StationModuleState[],
  resources: ResourceSnapshot,
  deltaHours: number,
  modifiers: SimulationModifiers,
  solarExposure: number
): void {
  for (const module of modules) {
    module.health = clampHealth(module.health - MODULE_PASSIVE_WEAR_PER_HOUR * deltaHours);
    if (!module.isOnline || module.health <= 0) {
      continue;
    }
    const moduleDelta: Partial<Record<ResourceType, number>> = {};
    const baseDelta = getModuleHourlyDelta(module.type, module.level);
    for (const resourceType of resourceTypes) {
      const value = baseDelta[resourceType];
      if (value === undefined) {
        continue;
      }
      let adjusted = getAdjustedDelta(value, modifiers);
      if (module.type === "solarArray" && resourceType === "energy" && adjusted > 0) {
        adjusted *= solarExposure;
      }
      moduleDelta[resourceType] = adjusted;
    }
    const efficiency = Math.max(0.2, module.health / 100);
    applyResourceDelta(resources, moduleDelta, deltaHours * efficiency);
  }
}

function applyCommandDirectiveEffects(
  resources: ResourceSnapshot,
  modules: StationModuleState[],
  deltaHours: number,
  commandState: SimulationInput["commandState"],
  modifiers: SimulationModifiers
): void {
  if (!commandState) {
    return;
  }

  switch (commandState.powerProfile) {
    case "lifeSupport":
      resources.energy = clampResource("energy", resources.energy - 6 * deltaHours);
      resources.oxygen = clampResource("oxygen", resources.oxygen + 4.6 * deltaHours);
      resources.water = clampResource("water", resources.water + 2.2 * deltaHours);
      resources.morale = clampResource("morale", resources.morale + 0.85 * deltaHours);
      resources.research = clampResource("research", resources.research - 1.7 * deltaHours);
      break;
    case "research":
      resources.energy = clampResource("energy", resources.energy - 7.4 * deltaHours);
      resources.research = clampResource("research", resources.research + 5.6 * deltaHours);
      resources.morale = clampResource("morale", resources.morale - 0.65 * deltaHours * modifiers.moraleLossMultiplier);
      resources.hullIntegrity = clampResource(
        "hullIntegrity",
        resources.hullIntegrity - 0.28 * deltaHours * modifiers.hullLossMultiplier
      );
      break;
    case "shielded":
      resources.energy = clampResource("energy", resources.energy - 8.8 * deltaHours);
      resources.hullIntegrity = clampResource("hullIntegrity", resources.hullIntegrity + 1.9 * deltaHours);
      resources.morale = clampResource("morale", resources.morale - 0.35 * deltaHours);
      break;
    default:
      break;
  }

  switch (commandState.subsystemFocus) {
    case "integrity":
      resources.hullIntegrity = clampResource("hullIntegrity", resources.hullIntegrity + 1.45 * deltaHours);
      resources.research = clampResource("research", resources.research - 1.05 * deltaHours);
      resources.credits = clampResource("credits", resources.credits - 2.1 * deltaHours);
      break;
    case "research":
      resources.research = clampResource("research", resources.research + 2.6 * deltaHours);
      resources.hullIntegrity = clampResource(
        "hullIntegrity",
        resources.hullIntegrity - 0.42 * deltaHours * modifiers.hullLossMultiplier
      );
      resources.morale = clampResource("morale", resources.morale - 0.22 * deltaHours * modifiers.moraleLossMultiplier);
      break;
    case "morale":
      resources.morale = clampResource("morale", resources.morale + 1.3 * deltaHours);
      resources.research = clampResource("research", resources.research - 0.88 * deltaHours);
      resources.credits = clampResource("credits", resources.credits - 1.8 * deltaHours);
      break;
    default:
      break;
  }

  switch (commandState.thermalPolicy) {
    case "economy":
      resources.energy = clampResource("energy", resources.energy + 2.8 * deltaHours);
      resources.research = clampResource("research", resources.research - 1.2 * deltaHours);
      break;
    case "boost":
      resources.energy = clampResource("energy", resources.energy - 4.3 * deltaHours);
      resources.research = clampResource("research", resources.research + 1.45 * deltaHours);
      for (const module of modules) {
        if (module.isOnline) {
          module.health = clampHealth(module.health - 0.22 * deltaHours);
        }
      }
      break;
    default:
      break;
  }
}

function applyThermalPenalties(
  modules: StationModuleState[],
  resources: ResourceSnapshot,
  deltaHours: number,
  telemetry: ReturnType<typeof deriveMissionTelemetry>,
  modifiers: SimulationModifiers
): void {
  if (telemetry.thermalLoad <= 55) {
    return;
  }

  const thermalPressure = (telemetry.thermalLoad - 55) / 45;
  const hullLoss = (0.65 + thermalPressure * 1.4) * deltaHours * modifiers.hullLossMultiplier;
  const moraleLoss = (0.7 + thermalPressure * 1.8) * deltaHours * modifiers.moraleLossMultiplier;

  resources.hullIntegrity = clampResource("hullIntegrity", resources.hullIntegrity - hullLoss);
  resources.morale = clampResource("morale", resources.morale - moraleLoss);

  if (telemetry.thermalLoad > 72) {
    for (const module of modules) {
      if (module.type === "reactor" || module.type === "solarArray" || module.type === "lifeSupport") {
        module.health = clampHealth(module.health - deltaHours * 0.9 * thermalPressure);
      }
    }
  }
}

function processOpenIncidents(
  activeIncidents: ActiveIncidentState[],
  modules: StationModuleState[],
  resources: ResourceSnapshot,
  deltaHours: number,
  nowMs: number,
  modifiers: SimulationModifiers
): { expiredIncidentIds: string[]; ongoingCount: number } {
  const expiredIncidentIds: string[] = [];
  let ongoingCount = 0;

  for (const incident of activeIncidents) {
    if (incident.endsAtMs !== null && incident.endsAtMs <= nowMs) {
      expiredIncidentIds.push(incident.id);
      continue;
    }
    ongoingCount += 1;
    const definition = INCIDENT_DEFINITIONS[incident.type];
    const severityScale = INCIDENT_SEVERITY_MULTIPLIER[incident.severity as 1 | 2 | 3] ?? INCIDENT_SEVERITY_MULTIPLIER[3];
    const adjustedOngoing: Partial<Record<ResourceType, number>> = {};
    for (const resourceType of resourceTypes) {
      const value = definition.ongoingImpactPerHour[resourceType];
      if (value === undefined) {
        continue;
      }
      let adjusted = value;
      if (resourceType === "morale" && adjusted < 0) {
        adjusted *= modifiers.moraleLossMultiplier;
      }
      if (resourceType === "hullIntegrity" && adjusted < 0) {
        adjusted *= modifiers.hullLossMultiplier;
      }
      adjustedOngoing[resourceType] = adjusted;
    }
    applyResourceDelta(resources, adjustedOngoing, deltaHours * severityScale);
    applyModuleDamage(modules, definition.ongoingModuleDamagePerHour, deltaHours * severityScale);
  }

  return { expiredIncidentIds, ongoingCount };
}

function rollIncidents(deltaHours: number, rng: () => number, modifiers: SimulationModifiers): GeneratedIncident[] {
  const incidents: GeneratedIncident[] = [];
  for (const type of incidentTypes) {
    const chancePerHour = INCIDENT_DEFINITIONS[type].chancePerHour;
    const probability = 1 - Math.pow(1 - Math.min(0.9, chancePerHour * modifiers.incidentChanceMultiplier), deltaHours);
    if (rng() <= probability) {
      incidents.push({
        type,
        severity: rollSeverity(rng),
        durationHours: rollDurationHours(type, rng)
      });
    }
  }
  return incidents;
}

function applyGeneratedIncidents(
  generatedIncidents: GeneratedIncident[],
  modules: StationModuleState[],
  resources: ResourceSnapshot,
  modifiers: SimulationModifiers
): void {
  for (const incident of generatedIncidents) {
    const definition = INCIDENT_DEFINITIONS[incident.type];
    const severityScale = INCIDENT_SEVERITY_MULTIPLIER[incident.severity as 1 | 2 | 3] ?? INCIDENT_SEVERITY_MULTIPLIER[3];
    const adjustedInstant: Partial<Record<ResourceType, number>> = {};
    for (const resourceType of resourceTypes) {
      const value = definition.instantImpact[resourceType];
      if (value === undefined) {
        continue;
      }
      let adjusted = value;
      if (resourceType === "morale" && adjusted < 0) {
        adjusted *= modifiers.moraleLossMultiplier;
      }
      if (resourceType === "hullIntegrity" && adjusted < 0) {
        adjusted *= modifiers.hullLossMultiplier;
      }
      adjustedInstant[resourceType] = adjusted;
    }
    applyResourceDelta(resources, adjustedInstant, severityScale);
    applyModuleDamage(modules, definition.ongoingModuleDamagePerHour, 0.25 * severityScale);
  }
}

function buildIncidentLogMessage(incident: GeneratedIncident): string {
  return `Incident detected: ${incident.type} (severity ${incident.severity})`;
}

function mapResourceDelta(before: ResourceSnapshot, after: ResourceSnapshot): ResourceSnapshot {
  const delta = buildZeroDelta(before);
  for (const resourceType of resourceTypes) {
    delta[resourceType] = Number((after[resourceType] - before[resourceType]).toFixed(3));
  }
  return delta;
}

export function simulateStationTick(input: SimulationInput): SimulationOutput {
  const boundedDeltaSeconds = Math.max(0, Math.min(Math.floor(input.deltaSeconds), SIMULATION_MAX_DELTA_SECONDS));
  const modifiers = input.modifiers ?? getDefaultModifiers();
  const beforeResources = copyResources(input.resources);
  const nextResources = copyResources(input.resources);
  const nextModules = copyModules(input.modules);

  if (boundedDeltaSeconds === 0) {
    const severity = getSeverityFromResources(nextResources);
    return {
      resources: nextResources,
      modules: nextModules,
      generatedIncidents: [],
      expiredIncidentIds: [],
      resourceDelta: buildZeroDelta(nextResources),
      logs: [],
      runSummary: {
        tickSeconds: 0,
        incidentCount: input.activeIncidents.length,
        criticalResources: computeCriticalResources(nextResources),
        severity
      }
    };
  }

  const deltaHours = boundedDeltaSeconds / 3600;
  const solarExposure = getSolarExposure(input.nowMs);
  applyPassiveModuleEffects(nextModules, nextResources, deltaHours, modifiers, solarExposure);
  applyCommandDirectiveEffects(nextResources, nextModules, deltaHours, input.commandState, modifiers);

  const incidentProgress = processOpenIncidents(
    input.activeIncidents,
    nextModules,
    nextResources,
    deltaHours,
    input.nowMs,
    modifiers
  );
  const generatedIncidents = rollIncidents(deltaHours, input.rng, modifiers);
  applyGeneratedIncidents(generatedIncidents, nextModules, nextResources, modifiers);
  const telemetry = deriveMissionTelemetry({
    resources: nextResources,
    modules: nextModules,
    openIncidents: incidentProgress.ongoingCount + generatedIncidents.length,
    nowMs: input.nowMs
  });
  applyThermalPenalties(nextModules, nextResources, deltaHours, telemetry, modifiers);
  applyScarcityPenalties(nextResources, deltaHours, modifiers);

  const resourceDelta = mapResourceDelta(beforeResources, nextResources);
  const logs = generatedIncidents.map(buildIncidentLogMessage);
  if (boundedDeltaSeconds >= 900 && solarExposure < 0.45) {
    logs.push("Orbital eclipse window detected. Solar intake is reduced.");
  }
  if (boundedDeltaSeconds >= 900 && telemetry.thermalLoad > 72) {
    logs.push("Thermal load is beyond nominal envelope. Redistribute subsystem priorities.");
  }
  const severity = getSeverityFromResources(nextResources);

  return {
    resources: nextResources,
    modules: nextModules,
    generatedIncidents,
    expiredIncidentIds: incidentProgress.expiredIncidentIds,
    resourceDelta,
    logs,
    runSummary: {
      tickSeconds: boundedDeltaSeconds,
      incidentCount: incidentProgress.ongoingCount + generatedIncidents.length,
      criticalResources: computeCriticalResources(nextResources),
      severity: stationSeverityStates.includes(severity) ? severity : "attention"
    }
  };
}
