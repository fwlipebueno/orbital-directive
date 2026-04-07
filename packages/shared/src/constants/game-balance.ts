import type { IncidentType, ModuleType, ResourceType } from "../enums/game";
import type { ResourceSnapshot } from "../types/game";

export const RESOURCE_MIN: ResourceSnapshot = {
  energy: 0,
  oxygen: 0,
  water: 0,
  food: 0,
  credits: 0,
  research: 0,
  hullIntegrity: 0,
  morale: 0
};

export const RESOURCE_MAX: ResourceSnapshot = {
  energy: 250,
  oxygen: 200,
  water: 200,
  food: 200,
  credits: 500_000,
  research: 500_000,
  hullIntegrity: 100,
  morale: 100
};

export const INITIAL_RESOURCES: ResourceSnapshot = {
  energy: 90,
  oxygen: 85,
  water: 70,
  food: 68,
  credits: 1_200,
  research: 40,
  hullIntegrity: 96,
  morale: 74
};

export interface ModuleDefinition {
  buildCostCredits: number;
  maxLevel: number;
  upgradeBaseCredits: number;
  repairCreditPerHealth: number;
  hourlyDeltaLevel1: Partial<Record<ResourceType, number>>;
}

export const MODULE_PASSIVE_WEAR_PER_HOUR = 0.22;

export const MODULE_DEFINITIONS: Record<ModuleType, ModuleDefinition> = {
  reactor: {
    buildCostCredits: 500,
    maxLevel: 5,
    upgradeBaseCredits: 380,
    repairCreditPerHealth: 3,
    hourlyDeltaLevel1: {
      energy: 46,
      hullIntegrity: -0.08
    }
  },
  solarArray: {
    buildCostCredits: 280,
    maxLevel: 5,
    upgradeBaseCredits: 220,
    repairCreditPerHealth: 2,
    hourlyDeltaLevel1: {
      energy: 24
    }
  },
  lifeSupport: {
    buildCostCredits: 400,
    maxLevel: 5,
    upgradeBaseCredits: 310,
    repairCreditPerHealth: 2,
    hourlyDeltaLevel1: {
      energy: -18,
      water: -8,
      oxygen: 24,
      morale: 0.8
    }
  },
  hydroponics: {
    buildCostCredits: 420,
    maxLevel: 5,
    upgradeBaseCredits: 330,
    repairCreditPerHealth: 2,
    hourlyDeltaLevel1: {
      energy: -10,
      water: -12,
      oxygen: 8,
      food: 19,
      morale: 0.4
    }
  },
  researchLab: {
    buildCostCredits: 460,
    maxLevel: 5,
    upgradeBaseCredits: 350,
    repairCreditPerHealth: 2,
    hourlyDeltaLevel1: {
      energy: -20,
      food: -4,
      research: 16,
      morale: -0.2
    }
  },
  repairBay: {
    buildCostCredits: 440,
    maxLevel: 5,
    upgradeBaseCredits: 340,
    repairCreditPerHealth: 2,
    hourlyDeltaLevel1: {
      energy: -14,
      credits: -10,
      hullIntegrity: 5
    }
  }
};

export const INCIDENT_SEVERITY_MULTIPLIER = {
  1: 1,
  2: 1.45,
  3: 1.95
} as const;

export interface IncidentDefinition {
  chancePerHour: number;
  baseDurationHours: [number, number];
  instantImpact: Partial<Record<ResourceType, number>>;
  ongoingImpactPerHour: Partial<Record<ResourceType, number>>;
  ongoingModuleDamagePerHour: Partial<Record<ModuleType, number>>;
  resolveCostCredits: number;
}

export const INCIDENT_DEFINITIONS: Record<IncidentType, IncidentDefinition> = {
  solarFlare: {
    chancePerHour: 0.012,
    baseDurationHours: [1, 2],
    instantImpact: {
      energy: -18,
      hullIntegrity: -5,
      morale: -2
    },
    ongoingImpactPerHour: {
      energy: -4,
      morale: -0.6
    },
    ongoingModuleDamagePerHour: {
      solarArray: 1.2
    },
    resolveCostCredits: 110
  },
  coolantLeak: {
    chancePerHour: 0.009,
    baseDurationHours: [2, 4],
    instantImpact: {
      energy: -12,
      hullIntegrity: -3
    },
    ongoingImpactPerHour: {
      energy: -7
    },
    ongoingModuleDamagePerHour: {
      reactor: 2
    },
    resolveCostCredits: 180
  },
  oxygenLeak: {
    chancePerHour: 0.008,
    baseDurationHours: [2, 3],
    instantImpact: {
      oxygen: -14,
      morale: -4
    },
    ongoingImpactPerHour: {
      oxygen: -7,
      morale: -1
    },
    ongoingModuleDamagePerHour: {
      lifeSupport: 1
    },
    resolveCostCredits: 170
  },
  reactorInstability: {
    chancePerHour: 0.007,
    baseDurationHours: [2, 5],
    instantImpact: {
      energy: -24,
      hullIntegrity: -6,
      morale: -3
    },
    ongoingImpactPerHour: {
      energy: -10,
      hullIntegrity: -1.2
    },
    ongoingModuleDamagePerHour: {
      reactor: 2.2,
      repairBay: 0.5
    },
    resolveCostCredits: 260
  },
  crewIllness: {
    chancePerHour: 0.006,
    baseDurationHours: [3, 6],
    instantImpact: {
      morale: -6,
      food: -3
    },
    ongoingImpactPerHour: {
      morale: -1.4,
      food: -1.2
    },
    ongoingModuleDamagePerHour: {},
    resolveCostCredits: 140
  },
  communicationsBlackout: {
    chancePerHour: 0.01,
    baseDurationHours: [2, 4],
    instantImpact: {
      credits: -20,
      research: -8
    },
    ongoingImpactPerHour: {
      credits: -4,
      research: -2,
      morale: -0.4
    },
    ongoingModuleDamagePerHour: {},
    resolveCostCredits: 150
  }
};

export const SIMULATION_MAX_DELTA_SECONDS = 60 * 60 * 72;

export const CRITICAL_RESOURCE_THRESHOLDS: Record<ResourceType, number> = {
  energy: 24,
  oxygen: 28,
  water: 24,
  food: 22,
  credits: 100,
  research: 0,
  hullIntegrity: 45,
  morale: 36
};

export const COMMAND_ACTION_RULES = {
  orbitalBurn: {
    energyCost: 26,
    creditsCost: 180,
    cooldownSeconds: 10 * 60
  },
  emergencyReserve: {
    creditsCost: 220,
    cooldownSeconds: 8 * 60,
    grants: {
      energy: 20,
      oxygen: 16,
      water: 14,
      morale: 4
    }
  }
} as const;

export function getModuleLevelMultiplier(level: number): number {
  return 1 + (Math.max(1, level) - 1) * 0.35;
}

function requireModuleDefinition(type: ModuleType): ModuleDefinition {
  const moduleDef = MODULE_DEFINITIONS[type];
  if (!moduleDef) {
    throw new Error(`Unknown module definition for ${type}`);
  }
  return moduleDef;
}

function requireIncidentDefinition(type: IncidentType): IncidentDefinition {
  const incidentDef = INCIDENT_DEFINITIONS[type];
  if (!incidentDef) {
    throw new Error(`Unknown incident definition for ${type}`);
  }
  return incidentDef;
}

export function getModuleHourlyDelta(type: ModuleType, level: number): Partial<Record<ResourceType, number>> {
  const moduleDef = requireModuleDefinition(type);
  const multiplier = getModuleLevelMultiplier(level);
  const entries: Array<[ResourceType, number]> = [];
  for (const [key, value] of Object.entries(moduleDef.hourlyDeltaLevel1) as Array<[ResourceType, number | undefined]>) {
    if (value === undefined) {
      continue;
    }
    entries.push([key, Number((value * multiplier).toFixed(3))]);
  }
  return Object.fromEntries(entries) as Partial<Record<ResourceType, number>>;
}

export function getModuleUpgradeCost(type: ModuleType, currentLevel: number): number {
  const moduleDef = requireModuleDefinition(type);
  const targetLevel = currentLevel + 1;
  if (targetLevel > moduleDef.maxLevel) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.ceil(moduleDef.upgradeBaseCredits * Math.pow(1.64, targetLevel - 1));
}

export function getModuleRepairCost(type: ModuleType, currentHealth: number): number {
  const missingHealth = Math.max(0, 100 - currentHealth);
  if (missingHealth === 0) {
    return 0;
  }
  return Math.ceil(missingHealth * requireModuleDefinition(type).repairCreditPerHealth);
}

export function getIncidentResolveCost(type: IncidentType, severity: number): number {
  const multiplier = INCIDENT_SEVERITY_MULTIPLIER[severity as 1 | 2 | 3] ?? INCIDENT_SEVERITY_MULTIPLIER[3];
  return Math.ceil(requireIncidentDefinition(type).resolveCostCredits * multiplier);
}
