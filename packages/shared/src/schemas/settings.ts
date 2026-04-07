import { z } from "zod";

export const updatePreferencesInputSchema = z.object({
  reducedSensoryMode: z.boolean(),
  compactDensity: z.boolean()
});
