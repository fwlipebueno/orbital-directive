import { z } from "zod";

export const stationLogsInputSchema = z.object({
  stationId: z.string().min(1),
  limit: z.number().int().min(1).max(200).default(50)
});
