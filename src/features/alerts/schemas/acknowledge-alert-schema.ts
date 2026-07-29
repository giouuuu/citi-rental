import { z } from "zod";

export const acknowledgeAlertSchema = z.object({
  id: z.uuid(),
  resolution_note: z.string().trim().max(2000).optional(),
});

export type AcknowledgeAlertInput = z.infer<typeof acknowledgeAlertSchema>;
