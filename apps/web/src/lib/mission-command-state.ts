import type { StationState } from "@orbital/shared";

export interface MissionPreset {
  powerProfile: StationState["commandState"]["powerProfile"];
  subsystemFocus: StationState["commandState"]["subsystemFocus"];
  thermalPolicy: StationState["commandState"]["thermalPolicy"];
}

export type MissionPressureBand = "stable" | "watch" | "critical" | "emergency";

export type MissionAction =
  | {
      kind: "openRoute";
      id: "resolveIncidents" | "openExpedition" | "openResearch";
      route: "/incidents" | "/expedition" | "/research";
      titleKey: string;
      detailKey: string;
      ctaKey: string;
    }
  | {
      kind: "applyPreset";
      id: "stabilizeHull" | "recoverResources" | "coolThermal";
      preset: MissionPreset;
      presetLabelKey: string;
      titleKey: string;
      detailKey: string;
      ctaKey: string;
    }
  | {
      kind: "reserve";
      id: "deployReserve";
      titleKey: string;
      detailKey: string;
      ctaKey: string;
    }
  | {
      kind: "orbitalBurn";
      id: "executeBurn";
      titleKey: string;
      detailKey: string;
      ctaKey: string;
    };

export interface MissionCommandState {
  openIncidents: number;
  damagedModules: number;
  hullIntegrity: number;
  pressureScore: number;
  pressureBand: MissionPressureBand;
  objectiveProgress: number;
  objectiveDone: number;
  objectiveTotal: number;
  loopPhase: "observe" | "stabilize" | "respond" | "advance";
  primaryThreat: {
    titleKey: string;
    bodyKey: string;
    metricValue: number;
    metricUnit: "count" | "percent";
  };
  nextAction: MissionAction;
}

const containmentPreset: MissionPreset = {
  powerProfile: "shielded",
  subsystemFocus: "integrity",
  thermalPolicy: "nominal"
};

const stabilizeResourcesPreset: MissionPreset = {
  powerProfile: "lifeSupport",
  subsystemFocus: "integrity",
  thermalPolicy: "economy"
};

const coolThermalPreset: MissionPreset = {
  powerProfile: "balanced",
  subsystemFocus: "integrity",
  thermalPolicy: "economy"
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

export function deriveMissionCommandState(station: StationState): MissionCommandState {
  const openIncidents = station.incidents.filter((incident) => incident.status === "open").length;
  const damagedModules = station.modules.filter((module) => module.health < 70).length;
  const hullIntegrity = station.resources.hullIntegrity ?? 0;
  const thermalLoad = station.missionTelemetry.thermalLoad;
  const hullPressure = station.missionTelemetry.hullPressure;
  const deltaVWindow = station.missionTelemetry.deltaVWindow;
  const criticalResources = station.runSummary.criticalResources.length;
  const energy = station.resources.energy ?? 0;
  const oxygen = station.resources.oxygen ?? 0;
  const water = station.resources.water ?? 0;
  const food = station.resources.food ?? 0;

  const resourcesAverage = (energy + oxygen + water + food) / 4;
  const resourceDeficit = Math.max(0, 55 - resourcesAverage);
  const incidentPressure = openIncidents * 17;
  const damagePressure = Math.max(0, 70 - hullIntegrity) * 0.8;
  const thermalPressure = Math.max(0, thermalLoad - 60) * 1.2;
  const pressureHull = Math.max(0, hullPressure - 65) * 0.9;
  const pressureCriticalResources = criticalResources * 10;
  const pressureScore = Math.round(
    Math.max(0, Math.min(100, incidentPressure + damagePressure + thermalPressure + pressureHull + resourceDeficit + pressureCriticalResources))
  );

  const pressureBand: MissionPressureBand =
    pressureScore >= 84 ? "emergency" : pressureScore >= 62 ? "critical" : pressureScore >= 38 ? "watch" : "stable";

  const resourcesStable = energy >= 35 && oxygen >= 35 && water >= 35 && food >= 35;
  const objectives = [resourcesStable, hullIntegrity >= 62, openIncidents === 0, thermalLoad <= 68];
  const objectiveDone = objectives.filter(Boolean).length;
  const objectiveTotal = objectives.length;
  const objectiveProgress = Math.round(clamp01(objectiveDone / objectiveTotal) * 100);

  const loopPhase: MissionCommandState["loopPhase"] =
    openIncidents > 0 ? "respond" : !resourcesStable || hullIntegrity < 62 || thermalLoad > 70 ? "stabilize" : pressureBand === "stable" ? "advance" : "observe";

  const primaryThreat =
    openIncidents > 0
      ? { titleKey: "dashboard.threatPrimary.incidents.title", bodyKey: "dashboard.threatPrimary.incidents.body", metricValue: openIncidents, metricUnit: "count" as const }
      : hullIntegrity < 60 || damagedModules >= 3
        ? { titleKey: "dashboard.threatPrimary.hull.title", bodyKey: "dashboard.threatPrimary.hull.body", metricValue: hullIntegrity, metricUnit: "percent" as const }
        : !resourcesStable
          ? { titleKey: "dashboard.threatPrimary.resources.title", bodyKey: "dashboard.threatPrimary.resources.body", metricValue: Math.round(resourcesAverage), metricUnit: "percent" as const }
          : thermalLoad > 70
            ? { titleKey: "dashboard.threatPrimary.thermal.title", bodyKey: "dashboard.threatPrimary.thermal.body", metricValue: Math.round(thermalLoad), metricUnit: "percent" as const }
            : { titleKey: "dashboard.threatPrimary.window.title", bodyKey: "dashboard.threatPrimary.window.body", metricValue: pressureScore, metricUnit: "percent" as const };

  const nextAction: MissionAction = (() => {
    if ((pressureBand === "emergency" || pressureBand === "critical") && station.commandState.emergencyReserve.ready && (hullIntegrity < 42 || criticalResources >= 2)) {
      return {
        kind: "reserve",
        id: "deployReserve",
        titleKey: "dashboard.nextAction.primary.reserve",
        detailKey: "dashboard.nextAction.detail.reserve",
        ctaKey: "dashboard.nextAction.cta.reserve"
      };
    }

    if (openIncidents > 0) {
      return {
        kind: "openRoute",
        id: "resolveIncidents",
        route: "/incidents",
        titleKey: "dashboard.nextAction.primary.incidents",
        detailKey: "dashboard.nextAction.detail.incidents",
        ctaKey: "dashboard.nextAction.cta.incidents"
      };
    }

    if (hullIntegrity < 56 || damagedModules >= 3) {
      return {
        kind: "applyPreset",
        id: "stabilizeHull",
        preset: containmentPreset,
        presetLabelKey: "dashboard.preset.containment",
        titleKey: "dashboard.nextAction.primary.hull",
        detailKey: "dashboard.nextAction.detail.hull",
        ctaKey: "dashboard.nextAction.cta.apply"
      };
    }

    if (!resourcesStable || criticalResources > 0) {
      return {
        kind: "applyPreset",
        id: "recoverResources",
        preset: stabilizeResourcesPreset,
        presetLabelKey: "dashboard.preset.stabilize",
        titleKey: "dashboard.nextAction.primary.resources",
        detailKey: "dashboard.nextAction.detail.resources",
        ctaKey: "dashboard.nextAction.cta.apply"
      };
    }

    if (thermalLoad > 72) {
      return {
        kind: "applyPreset",
        id: "coolThermal",
        preset: coolThermalPreset,
        presetLabelKey: "dashboard.nextAction.preset.cooling",
        titleKey: "dashboard.nextAction.primary.thermal",
        detailKey: "dashboard.nextAction.detail.thermal",
        ctaKey: "dashboard.nextAction.cta.apply"
      };
    }

    if (deltaVWindow === "open" && station.commandState.orbitalBurn.ready && pressureBand === "watch") {
      return {
        kind: "orbitalBurn",
        id: "executeBurn",
        titleKey: "dashboard.nextAction.primary.burn",
        detailKey: "dashboard.nextAction.detail.burn",
        ctaKey: "dashboard.nextAction.cta.burn"
      };
    }

    if (deltaVWindow === "open") {
      return {
        kind: "openRoute",
        id: "openExpedition",
        route: "/expedition",
        titleKey: "dashboard.nextAction.primary.expedition",
        detailKey: "dashboard.nextAction.detail.expedition",
        ctaKey: "dashboard.nextAction.cta.expedition"
      };
    }

    return {
      kind: "openRoute",
      id: "openResearch",
      route: "/research",
      titleKey: "dashboard.nextAction.primary.research",
      detailKey: "dashboard.nextAction.detail.research",
      ctaKey: "dashboard.nextAction.cta.research"
    };
  })();

  return {
    openIncidents,
    damagedModules,
    hullIntegrity,
    pressureScore,
    pressureBand,
    objectiveProgress,
    objectiveDone,
    objectiveTotal,
    loopPhase,
    primaryThreat,
    nextAction
  };
}
