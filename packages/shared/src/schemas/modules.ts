import { z } from "zod";
import { moduleTypes } from "../enums/game";

export const moduleTypeSchema = z.enum(moduleTypes);

export const moduleUpgradeInputSchema = z.object({
  stationId: z.string().min(1),
  moduleType: moduleTypeSchema,
  idempotencyKey: z.string().uuid()
});

export const moduleRepairInputSchema = z.object({
  stationId: z.string().min(1),
  moduleType: moduleTypeSchema,
  idempotencyKey: z.string().uuid()
});

export const moduleToggleInputSchema = z.object({
  stationId: z.string().min(1),
  moduleType: moduleTypeSchema,
  isOnline: z.boolean()
});
