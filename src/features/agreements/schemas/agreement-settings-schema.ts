import { z } from "zod";

export const agreementSettingsSchema = z.object({
  legal_name: z
    .string()
    .trim()
    .min(2, "Enter the business name printed on the agreement.")
    .max(160),
  business_address: z
    .string()
    .trim()
    .min(5, "Enter the business address printed on the agreement.")
    .max(300),
  contact_email: z.union([
    z.email("Enter a valid email address.").trim().max(200),
    z.literal(""),
  ]),
});

export type AgreementSettingsInput = z.infer<typeof agreementSettingsSchema>;
