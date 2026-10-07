import { z } from "zod";

const phoneChannel = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || /^\+?[\d\s()-]{7,24}$/.test(value),
    "Use international format, e.g. +63 917 123 4567.",
  )
  .optional();
const handleChannel = z.string().trim().max(200).optional();

export const settingsSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    timezone: z.string().trim().min(1).max(80),
    tracker_online_threshold_minutes: z.coerce.number().int().min(1).max(60),
    tracker_delayed_threshold_minutes: z.coerce.number().int().min(2).max(240),
    location_retention_days: z.coerce.number().int().min(1).max(3650),
    gps_provider: z.enum(["simulator", "traccar"]),
    deposit_percent: z.coerce.number().min(1).max(100),
    payment_qr_url: z
      .union([z.url("Enter a valid QR image URL."), z.literal("")])
      .optional(),
    payment_instructions: z.string().trim().max(2000).optional(),
    contact_phone: phoneChannel,
    contact_whatsapp: phoneChannel,
    contact_viber: phoneChannel,
    contact_wechat: handleChannel,
    contact_kakaotalk: handleChannel,
    contact_line: handleChannel,
    contact_telegram: handleChannel,
    contact_messenger: handleChannel,
  })
  .refine(
    (value) =>
      value.tracker_delayed_threshold_minutes >
      value.tracker_online_threshold_minutes,
    {
      message: "Delayed threshold must be greater than the online threshold.",
      path: ["tracker_delayed_threshold_minutes"],
    },
  );

export type SettingsInput = z.infer<typeof settingsSchema>;
