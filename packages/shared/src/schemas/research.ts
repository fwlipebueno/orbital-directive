import { z } from "zod";
import { RESEARCH_UPGRADE_KEYS } from "../constants/research";

export const researchUpgradeKeySchema = z.enum(RESEARCH_UPGRADE_KEYS);

export const researchUpgradeInputSchema = z.object({
  stationId: z.string().min(1),
  upgradeKey: researchUpgradeKeySchema,
  idempotencyKey: z.string().uuid()
});
