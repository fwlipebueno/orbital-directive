import { z } from "zod";
import { incidentTypes } from "../enums/game";

export const incidentResolveInputSchema = z.object({
  stationId: z.string().min(1),
  incidentId: z.string().min(1),
  idempotencyKey: z.string().uuid()
});

export const incidentTypeSchema = z.enum(incidentTypes);
