export const RESEARCH_UPGRADE_KEYS = ["efficiencyProtocol", "crewResilience", "shieldHarmonics"] as const;

export type ResearchUpgradeKey = (typeof RESEARCH_UPGRADE_KEYS)[number];

export interface ResearchUpgradeDefinition {
  label: string;
  description: string;
  maxLevel: number;
  baseCostResearch: number;
}

export const RESEARCH_UPGRADES: Record<ResearchUpgradeKey, ResearchUpgradeDefinition> = {
  efficiencyProtocol: {
    label: "Efficiency Protocol",
    description: "Improves production while reducing operational consumption.",
    maxLevel: 3,
    baseCostResearch: 120
  },
  crewResilience: {
    label: "Crew Resilience",
    description: "Reduces morale degradation under pressure.",
    maxLevel: 3,
    baseCostResearch: 110
  },
  shieldHarmonics: {
    label: "Shield Harmonics",
    description: "Mitigates hull damage and lowers incident pressure.",
    maxLevel: 3,
    baseCostResearch: 140
  }
};

export function getResearchUpgradeCost(currentLevel: number, baseCostResearch: number): number {
  return Math.ceil(baseCostResearch * Math.pow(1.75, currentLevel));
}
