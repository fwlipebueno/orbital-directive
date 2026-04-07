import type { ModuleType } from "../enums/game";
import type { MissionTelemetry, ResourceSnapshot, StationModuleState } from "../types/game";

export const ORBITAL_CYCLE_SECONDS = 5_400;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sumOnlineModuleLevels(modules: StationModuleState[], type: ModuleType): number {
  return modules
    .filter((module) => module.type === type && module.isOnline)
    .reduce((total, module) => total + module.level, 0);
}

export function getSolarExposure(nowMs: number): number {
  const cycleProgress = ((Math.floor(nowMs / 1000) % ORBITAL_CYCLE_SECONDS) + ORBITAL_CYCLE_SECONDS) / ORBITAL_CYCLE_SECONDS;
  const phase = cycleProgress * Math.PI * 2;
  const exposure = 0.35 + Math.max(0, Math.sin(phase)) * 0.95;
  return Number(exposure.toFixed(3));
}

export function deriveMissionTelemetry(input: {
  resources: ResourceSnapshot;
  modules: StationModuleState[];
  openIncidents: number;
  nowMs: number;
}): MissionTelemetry {
  const solarExposure = getSolarExposure(input.nowMs);
  const reactorLoad = sumOnlineModuleLevels(input.modules, "reactor") * 9;
  const coolingCapacity =
    sumOnlineModuleLevels(input.modules, "repairBay") * 6 + sumOnlineModuleLevels(input.modules, "lifeSupport") * 2;
  const incidentStress = input.openIncidents * 6;
  const insolationStress = solarExposure > 1 ? (solarExposure - 1) * 24 : 0;
  const structuralStress = Math.max(0, 100 - input.resources.hullIntegrity) * 0.15;

  const thermalLoad = clamp(
    18 + reactorLoad + incidentStress + insolationStress + structuralStress - coolingCapacity,
    0,
    100
  );

  const hullPressure = clamp(
    (100 - input.resources.hullIntegrity) * 1.05 +
      incidentStress +
      Math.max(0, thermalLoad - 50) * 0.4 +
      Math.max(0, 40 - input.resources.oxygen) * 0.35,
    0,
    100
  );

  const orbitalStability = clamp(
    100 -
      hullPressure * 0.72 -
      Math.max(0, 50 - input.resources.morale) * 0.42 -
      Math.max(0, 40 - input.resources.energy) * 0.36,
    0,
    100
  );

  const deltaVWindow: MissionTelemetry["deltaVWindow"] =
    orbitalStability >= 70 && input.resources.energy >= 55
      ? "open"
      : orbitalStability >= 40 && input.resources.energy >= 30
        ? "narrow"
        : "closed";

  const operationalRisk: MissionTelemetry["operationalRisk"] =
    orbitalStability < 28 || hullPressure > 82 || input.resources.oxygen < 20
      ? "critical"
      : orbitalStability < 45 || hullPressure > 64 || thermalLoad > 72
        ? "high"
        : orbitalStability < 68 || thermalLoad > 54
          ? "moderate"
          : "low";

  return {
    solarExposure: Number(solarExposure.toFixed(3)),
    orbitalStability: Number(orbitalStability.toFixed(2)),
    thermalLoad: Number(thermalLoad.toFixed(2)),
    hullPressure: Number(hullPressure.toFixed(2)),
    deltaVWindow,
    operationalRisk
  };
}
