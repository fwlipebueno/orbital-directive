import type { IncidentType, ModuleType, ResourceType, StationSeverityState } from "@orbital/shared";

type Translator = (key: string) => string;

export function resourceLabel(t: Translator, resource: ResourceType): string {
  return t(`resource.${resource}`);
}

export function moduleLabel(t: Translator, moduleType: ModuleType): string {
  return t(`module.${moduleType}`);
}

export function incidentLabel(t: Translator, incidentType: IncidentType): string {
  return t(`incident.${incidentType}`);
}

export function severityLabel(t: Translator, severity: StationSeverityState): string {
  return t(`state.${severity}`);
}

export function incidentSeverityLabel(t: Translator, severity: number): string {
  if (severity <= 1) {
    return t("incidents.severity.low");
  }
  if (severity === 2) {
    return t("incidents.severity.medium");
  }
  return t("incidents.severity.high");
}
