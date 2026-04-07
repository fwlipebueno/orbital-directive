import {
  COMMAND_ACTION_RULES,
  commandStateSchema,
  deriveMissionTelemetry,
  stationStateSchema,
  type ActiveIncidentState,
  type CommandDirectiveState,
  type ModuleType,
  type ResourceSnapshot,
  type SimulationModifiers,
  type StationState,
  simulateStationTick
} from "@orbital/shared";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { researchRepository } from "../db/repositories/research-repository";
import { stationRepository } from "../db/repositories/station-repository";
import { AppError } from "../utils/errors";
import { secureRandom } from "../utils/rng";
import { mapStationState } from "../modules/stations/station.mapper";

function resourceSnapshotFromRow(resources: Awaited<ReturnType<typeof stationRepository.getResources>>): ResourceSnapshot {
  if (!resources) {
    throw new AppError("Station resources not found.", "STATION_RESOURCES_NOT_FOUND", 500);
  }
  return {
    energy: Number(resources.energy),
    oxygen: Number(resources.oxygen),
    water: Number(resources.water),
    food: Number(resources.food),
    credits: Number(resources.credits),
    research: Number(resources.research),
    hullIntegrity: Number(resources.hullIntegrity),
    morale: Number(resources.morale)
  };
}

function buildSimulationModifiers(upgrades: Awaited<ReturnType<typeof researchRepository.listByStation>>): SimulationModifiers {
  const map = new Map(upgrades.map((upgrade) => [upgrade.upgradeKey, upgrade.level]));
  const efficiencyLevel = map.get("efficiencyProtocol") ?? 0;
  const resilienceLevel = map.get("crewResilience") ?? 0;
  const shieldLevel = map.get("shieldHarmonics") ?? 0;

  return {
    productionMultiplier: 1 + efficiencyLevel * 0.05,
    consumptionMultiplier: Math.max(0.75, 1 - efficiencyLevel * 0.04),
    moraleLossMultiplier: Math.max(0.7, 1 - resilienceLevel * 0.08),
    hullLossMultiplier: Math.max(0.7, 1 - shieldLevel * 0.08),
    incidentChanceMultiplier: Math.max(0.72, 1 - shieldLevel * 0.05)
  };
}

function withCommandStateModifiers(
  base: SimulationModifiers,
  commandState: Pick<CommandDirectiveState, "powerProfile" | "subsystemFocus" | "thermalPolicy">
): SimulationModifiers {
  const next: SimulationModifiers = { ...base };

  switch (commandState.powerProfile) {
    case "lifeSupport":
      next.moraleLossMultiplier *= 0.9;
      break;
    case "research":
      next.incidentChanceMultiplier *= 1.08;
      break;
    case "shielded":
      next.incidentChanceMultiplier *= 0.9;
      next.hullLossMultiplier *= 0.9;
      break;
    default:
      break;
  }

  switch (commandState.thermalPolicy) {
    case "economy":
      next.productionMultiplier *= 0.94;
      next.consumptionMultiplier *= 0.9;
      break;
    case "boost":
      next.productionMultiplier *= 1.08;
      next.consumptionMultiplier *= 1.12;
      break;
    default:
      break;
  }

  return next;
}

function computeCooldown(lastAt: Date | null, cooldownSeconds: number, now: Date): number {
  if (!lastAt) {
    return 0;
  }
  const remainingMs = lastAt.getTime() + cooldownSeconds * 1000 - now.getTime();
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

function mapCommandStateForClient(
  state: Awaited<ReturnType<typeof stationRepository.ensureCommandState>>,
  now: Date
): StationState["commandState"] {
  const burnCooldown = computeCooldown(state?.lastOrbitalBurnAt ?? null, COMMAND_ACTION_RULES.orbitalBurn.cooldownSeconds, now);
  const reserveCooldown = computeCooldown(
    state?.lastReserveDeployAt ?? null,
    COMMAND_ACTION_RULES.emergencyReserve.cooldownSeconds,
    now
  );

  return {
    powerProfile: state?.powerProfile ?? "balanced",
    subsystemFocus: state?.subsystemFocus ?? "balanced",
    thermalPolicy: state?.thermalPolicy ?? "nominal",
    lastOrbitalBurnAt: state?.lastOrbitalBurnAt ? state.lastOrbitalBurnAt.toISOString() : null,
    lastReserveDeployAt: state?.lastReserveDeployAt ? state.lastReserveDeployAt.toISOString() : null,
    orbitalBurn: {
      ready: burnCooldown === 0,
      cooldownSecondsRemaining: burnCooldown,
      energyCost: COMMAND_ACTION_RULES.orbitalBurn.energyCost,
      creditsCost: COMMAND_ACTION_RULES.orbitalBurn.creditsCost
    },
    emergencyReserve: {
      ready: reserveCooldown === 0,
      cooldownSecondsRemaining: reserveCooldown,
      creditsCost: COMMAND_ACTION_RULES.emergencyReserve.creditsCost
    }
  };
}

function activeIncidentRowsToSimulation(incidents: Awaited<ReturnType<typeof stationRepository.getOpenIncidents>>): ActiveIncidentState[] {
  return incidents.map((incident) => ({
    id: incident.id,
    type: incident.incidentType as ActiveIncidentState["type"],
    severity: incident.severity,
    startedAtMs: incident.startedAt.getTime(),
    endsAtMs: incident.endsAt ? incident.endsAt.getTime() : null
  }));
}

export const stationSimulationService = {
  async processAndGetState(stationId: string, userId: string): Promise<StationState> {
    const stationState = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM stations WHERE id = ${stationId} FOR UPDATE`);

      const station = await stationRepository.findByIdAndUser(stationId, userId, tx);
      if (!station) {
        throw new AppError("Station not found.", "STATION_NOT_FOUND", 404);
      }

      const resourcesRow = await stationRepository.getResources(stationId, tx);
      const modules = await stationRepository.getModules(stationId, tx);
      const incidents = await stationRepository.getIncidents(stationId, tx);
      const openIncidents = incidents.filter((incident) => incident.status === "open");
      const researchUpgrades = await researchRepository.listByStation(stationId, tx);
      const commandState = await stationRepository.ensureCommandState(stationId, tx);

      if (!resourcesRow) {
        throw new AppError("Station resources not found.", "STATION_RESOURCES_NOT_FOUND", 500);
      }

      const now = new Date();
      const deltaMs = now.getTime() - station.lastProcessedAt.getTime();
      const deltaSeconds = Math.max(0, Math.floor(deltaMs / 1000));

      const simulation = simulateStationTick({
        resources: resourceSnapshotFromRow(resourcesRow),
        modules: modules.map((module) => ({
          id: module.id,
          type: module.moduleType as ModuleType,
          level: module.level,
          health: Number(module.health),
          isOnline: module.isOnline
        })),
        activeIncidents: activeIncidentRowsToSimulation(openIncidents),
        deltaSeconds,
        nowMs: now.getTime(),
        commandState: commandState
          ? commandStateSchema.parse({
              powerProfile: commandState.powerProfile,
              subsystemFocus: commandState.subsystemFocus,
              thermalPolicy: commandState.thermalPolicy
            })
          : {
              powerProfile: "balanced",
              subsystemFocus: "balanced",
              thermalPolicy: "nominal"
            },
        modifiers: withCommandStateModifiers(
          buildSimulationModifiers(researchUpgrades),
          commandState
            ? {
                powerProfile: commandState.powerProfile,
                subsystemFocus: commandState.subsystemFocus,
                thermalPolicy: commandState.thermalPolicy
              }
            : {
                powerProfile: "balanced",
                subsystemFocus: "balanced",
                thermalPolicy: "nominal"
              }
        ),
        rng: secureRandom
      });

      if (simulation.runSummary.tickSeconds > 0) {
        await stationRepository.updateResources(stationId, simulation.resources, tx);

        await stationRepository.updateModuleStates(
          stationId,
          simulation.modules.map((module) => ({
            moduleType: module.type,
            level: module.level,
            health: module.health,
            isOnline: module.isOnline
          })),
          tx
        );

        await stationRepository.closeExpiredIncidents(stationId, simulation.expiredIncidentIds, now, tx);

        for (const generatedIncident of simulation.generatedIncidents) {
          const startedAt = now;
          const endsAt = new Date(now.getTime() + generatedIncident.durationHours * 60 * 60 * 1000);
          await stationRepository.insertIncident(
            {
              id: randomUUID(),
              stationId,
              incidentType: generatedIncident.type,
              severity: generatedIncident.severity,
              status: "open",
              startedAt,
              endsAt,
              metadata: {
                origin: "simulation",
                durationHours: generatedIncident.durationHours
              }
            },
            tx
          );
        }

        for (const message of simulation.logs) {
          await stationRepository.appendLog(stationId, "event", message, { source: "simulation" }, tx);
        }

        if (simulation.runSummary.tickSeconds >= 60) {
          await stationRepository.appendRunSummary(
            stationId,
            {
              tickSeconds: simulation.runSummary.tickSeconds,
              incidentCount: simulation.runSummary.incidentCount,
              severity: simulation.runSummary.severity,
              criticalResources: simulation.runSummary.criticalResources
            },
            tx
          );
        }

        await stationRepository.incrementVersionAndProcessedAt(stationId, now, tx);
      }

      const refreshedStation = await stationRepository.findByIdAndUser(stationId, userId, tx);
      const refreshedResources = await stationRepository.getResources(stationId, tx);
      const refreshedModules = await stationRepository.getModules(stationId, tx);
      const refreshedIncidents = await stationRepository.getIncidents(stationId, tx);
      const refreshedLogs = await stationRepository.getRecentLogs(stationId, 60, tx);
      const refreshedCommandState = await stationRepository.ensureCommandState(stationId, tx);

      if (!refreshedStation || !refreshedResources) {
        throw new AppError("Station aggregation failed.", "STATION_AGGREGATION_ERROR", 500);
      }

      const runSummary = {
        tickSeconds: simulation.runSummary.tickSeconds,
        incidentCount: refreshedIncidents.filter((incident) => incident.status === "open").length,
        criticalResources: simulation.runSummary.criticalResources,
        severity: simulation.runSummary.severity
      };

      const missionTelemetry = deriveMissionTelemetry({
        resources: resourceSnapshotFromRow(refreshedResources),
        modules: refreshedModules.map((module) => ({
          id: module.id,
          type: module.moduleType as ModuleType,
          level: module.level,
          health: Number(module.health),
          isOnline: module.isOnline
        })),
        openIncidents: refreshedIncidents.filter((incident) => incident.status === "open").length,
        nowMs: now.getTime()
      });

      return stationStateSchema.parse(
        mapStationState({
          station: refreshedStation,
          resources: refreshedResources,
          modules: refreshedModules,
          incidents: refreshedIncidents,
          logs: refreshedLogs,
          runSummary,
          missionTelemetry,
          commandState: mapCommandStateForClient(refreshedCommandState, now)
        })
      );
    });

    return stationState;
  }
};
