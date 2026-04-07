import type { StationState } from "@orbital/shared";
import { stationIncidents, stationLogs, stationModules, stationResources, stations } from "../../db/schema";

type StationRow = typeof stations.$inferSelect;
type ResourceRow = typeof stationResources.$inferSelect;
type ModuleRow = typeof stationModules.$inferSelect;
type IncidentRow = typeof stationIncidents.$inferSelect;
type LogRow = typeof stationLogs.$inferSelect;

function n(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

export function mapStationState(input: {
  station: StationRow;
  resources: ResourceRow;
  modules: ModuleRow[];
  incidents: IncidentRow[];
  logs: LogRow[];
  runSummary: StationState["runSummary"];
  missionTelemetry: StationState["missionTelemetry"];
  commandState: StationState["commandState"];
}): StationState {
  return {
    stationId: input.station.id,
    stationName: input.station.name,
    version: input.station.version,
    lastProcessedAt: input.station.lastProcessedAt.toISOString(),
    resources: {
      energy: n(input.resources.energy),
      oxygen: n(input.resources.oxygen),
      water: n(input.resources.water),
      food: n(input.resources.food),
      credits: n(input.resources.credits),
      research: n(input.resources.research),
      hullIntegrity: n(input.resources.hullIntegrity),
      morale: n(input.resources.morale)
    },
    modules: input.modules.map((module) => ({
      id: module.id,
      type: module.moduleType as StationState["modules"][number]["type"],
      level: module.level,
      health: n(module.health),
      isOnline: module.isOnline
    })),
    incidents: input.incidents.map((incident) => ({
      id: incident.id,
      type: incident.incidentType as StationState["incidents"][number]["type"],
      severity: incident.severity,
      status: incident.status,
      startedAt: incident.startedAt.toISOString(),
      resolvedAt: incident.resolvedAt ? incident.resolvedAt.toISOString() : null
    })),
    openIncidentCount: input.incidents.filter((incident) => incident.status === "open").length,
    logs: input.logs.map((log) => ({
      id: String(log.id),
      type: log.logType === "system" ? "event" : (log.logType as "event" | "action" | "audit"),
      message: log.message,
      createdAt: log.createdAt.toISOString()
    })),
    runSummary: input.runSummary,
    missionTelemetry: input.missionTelemetry,
    commandState: input.commandState
  };
}
