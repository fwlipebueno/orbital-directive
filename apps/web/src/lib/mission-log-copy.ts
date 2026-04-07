import type { IncidentType, ModuleType } from "@orbital/shared";
import { incidentLabel, moduleLabel } from "./game-labels";

type Translator = (key: string, params?: Record<string, string | number>) => string;
type Locale = "pt-BR" | "en-US";

const researchUpgradeLabels: Record<string, Record<Locale, string>> = {
  efficiencyProtocol: { "pt-BR": "Protocolo de eficiência", "en-US": "Efficiency Protocol" },
  crewResilience: { "pt-BR": "Resiliência da tripulação", "en-US": "Crew Resilience" },
  shieldHarmonics: { "pt-BR": "Harmônicos de escudo", "en-US": "Shield Harmonics" }
};

function getResearchLabel(upgradeKey: string, locale: Locale): string {
  return researchUpgradeLabels[upgradeKey]?.[locale] ?? upgradeKey;
}

export function localizeLogType(type: string, t: Translator): string {
  switch (type) {
    case "event":
      return t("logs.type.event");
    case "action":
      return t("logs.type.action");
    case "audit":
      return t("logs.type.audit");
    default:
      return type;
  }
}

export function localizeMissionLogMessage(message: string, t: Translator, locale: Locale): string {
  const moduleUpgrade = message.match(/^Module ([a-zA-Z]+) upgraded to level (\d+)$/);
  if (moduleUpgrade) {
    const moduleType = moduleUpgrade[1];
    const level = moduleUpgrade[2];
    if (!moduleType || !level) {
      return message;
    }
    return t("log.module.upgraded", {
      module: moduleLabel(t as (key: string) => string, moduleType as ModuleType),
      level
    });
  }

  const moduleRepair = message.match(/^Module ([a-zA-Z]+) fully repaired$/);
  if (moduleRepair) {
    const moduleType = moduleRepair[1];
    if (!moduleType) {
      return message;
    }
    return t("log.module.repaired", {
      module: moduleLabel(t as (key: string) => string, moduleType as ModuleType)
    });
  }

  const moduleToggle = message.match(/^Module ([a-zA-Z]+) (enabled|disabled)$/);
  if (moduleToggle) {
    const moduleType = moduleToggle[1];
    const toggleState = moduleToggle[2];
    if (!moduleType || !toggleState) {
      return message;
    }
    const key = toggleState === "enabled" ? "log.module.enabled" : "log.module.disabled";
    return t(key, {
      module: moduleLabel(t as (key: string) => string, moduleType as ModuleType)
    });
  }

  const incidentResolve = message.match(/^Incident ([a-zA-Z]+) resolved$/);
  if (incidentResolve) {
    const incidentType = incidentResolve[1];
    if (!incidentType) {
      return message;
    }
    return t("log.incident.resolved", {
      incident: incidentLabel(t as (key: string) => string, incidentType as IncidentType)
    });
  }

  const researchUpgrade = message.match(/^Research upgrade ([a-zA-Z]+) advanced to level (\d+)$/);
  if (researchUpgrade) {
    const upgradeKey = researchUpgrade[1];
    const level = researchUpgrade[2];
    if (!upgradeKey || !level) {
      return message;
    }
    return t("log.research.upgraded", {
      upgrade: getResearchLabel(upgradeKey, locale),
      level
    });
  }

  const commandProfile = message.match(/^Command profile updated: ([a-zA-Z]+) \/ ([a-zA-Z]+) \/ ([a-zA-Z]+)$/);
  if (commandProfile) {
    const power = commandProfile[1];
    const focus = commandProfile[2];
    const policy = commandProfile[3];
    if (!power || !focus || !policy) {
      return message;
    }
    return t("log.command.profile", {
      power: t(`command.powerProfile.${power}`),
      focus: t(`command.subsystemFocus.${focus}`),
      policy: t(`command.thermalPolicy.${policy}`)
    });
  }

  switch (message) {
    case "Orbital eclipse window detected. Solar intake is reduced.":
      return t("log.event.eclipse");
    case "Orbital correction burn executed successfully.":
      return t("log.action.orbitalBurn");
    case "Emergency reserve package deployed.":
      return t("log.action.reserve");
    case "Station reset executed":
      return t("log.action.reset");
    case "Demo station ready for recruiter walkthrough":
      return t("log.event.demoReady");
    default:
      return message;
  }
}
