import { z } from "zod";
import { powerProfiles, subsystemFocusModes, thermalPolicies } from "../enums/game";

export const powerProfileSchema = z.enum(powerProfiles);
export const subsystemFocusSchema = z.enum(subsystemFocusModes);
export const thermalPolicySchema = z.enum(thermalPolicies);

export const commandStateSchema = z.object({
  powerProfile: powerProfileSchema,
  subsystemFocus: subsystemFocusSchema,
  thermalPolicy: thermalPolicySchema
});

export const updateCommandStateInputSchema = z.object({
  stationId: z.string().min(1),
  powerProfile: powerProfileSchema,
  subsystemFocus: subsystemFocusSchema,
  thermalPolicy: thermalPolicySchema
});

export const commandActionInputSchema = z.object({
  stationId: z.string().min(1),
  idempotencyKey: z.string().uuid()
});

export type UpdateCommandStateInput = z.infer<typeof updateCommandStateInputSchema>;
export type CommandActionInput = z.infer<typeof commandActionInputSchema>;
