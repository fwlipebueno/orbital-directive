import { getIncidentResolveCost, type IncidentType } from "@orbital/shared";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { auditRepository } from "../../db/repositories/audit-repository";
import { stationRepository } from "../../db/repositories/station-repository";
import { stationIncidents, stationResources, stations } from "../../db/schema";
import { idempotencyService } from "../../services/idempotency-service";
import { stationSimulationService } from "../../services/station-simulation-service";
import { assertUserCriticalRateLimit } from "../../security/rate-limit";
import { AppError } from "../../utils/errors";

interface ActionMeta {
  ipAddress?: string;
  userAgent?: string;
}

function asNumber(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

export const incidentService = {
  async resolveIncident(userId: string, stationId: string, incidentId: string, idempotencyKey: string, meta?: ActionMeta) {
    assertUserCriticalRateLimit(userId, "incident.resolve");

    await stationSimulationService.processAndGetState(stationId, userId);

    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM stations WHERE id = ${stationId} FOR UPDATE`);
      const station = await stationRepository.findByIdAndUser(stationId, userId, tx);
      if (!station) {
        throw new AppError("Station not found.", "STATION_NOT_FOUND", 404);
      }

      return idempotencyService.run({
        userId,
        action: "incident.resolve",
        idempotencyKey,
        executor: tx,
        run: async () => {
          const incident = await tx.query.stationIncidents.findFirst({
            where: and(eq(stationIncidents.id, incidentId), eq(stationIncidents.stationId, stationId))
          });
          if (!incident) {
            throw new AppError("Incident not found.", "INCIDENT_NOT_FOUND", 404);
          }
          if (incident.status === "resolved") {
            return {
              ok: true,
              incidentId,
              alreadyResolved: true
            };
          }

          const resources = await stationRepository.getResources(stationId, tx);
          if (!resources) {
            throw new AppError("Station resources unavailable.", "STATION_RESOURCES_NOT_FOUND", 500);
          }

          const resolveCost = getIncidentResolveCost(incident.incidentType as IncidentType, incident.severity);
          const credits = asNumber(resources.credits);
          if (credits < resolveCost) {
            throw new AppError("Not enough credits to resolve incident.", "INSUFFICIENT_CREDITS", 409);
          }

          await tx
            .update(stationIncidents)
            .set({
              status: "resolved",
              resolvedAt: new Date()
            })
            .where(and(eq(stationIncidents.id, incidentId), eq(stationIncidents.stationId, stationId)));

          await tx
            .update(stationResources)
            .set({
              credits: String(credits - resolveCost)
            })
            .where(eq(stationResources.stationId, stationId));

          await tx
            .update(stations)
            .set({ version: sql`${stations.version} + 1` })
            .where(eq(stations.id, stationId));

          await stationRepository.appendLog(
            stationId,
            "action",
            `Incident ${incident.incidentType} resolved`,
            { incidentId, cost: resolveCost },
            tx
          );

          await auditRepository.append(
            {
              userId,
              stationId,
              action: "incident.resolve",
              resourceType: "station_incident",
              resourceId: incidentId,
              ipAddress: meta?.ipAddress,
              userAgent: meta?.userAgent,
              metadata: {
                incidentType: incident.incidentType,
                severity: incident.severity,
                cost: resolveCost
              }
            },
            tx
          );

          return {
            ok: true,
            incidentId,
            cost: resolveCost
          };
        }
      });
    });
  }
};
