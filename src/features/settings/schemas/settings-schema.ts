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
/** An optional peso amount: empty means staff quote it. */
const optionalFee = (negative: string) =>
  z.preprocess(
    (value) =>
      value === "" || value == null || Number.isNaN(value) ? null : value,
    z.coerce.number().min(0, negative).max(1_000_000).nullable(),
  );

const reviewLink = z
  .string()
  .trim()
  .max(500, "Keep the link under 500 characters.")
  .refine(
    (value) => value === "" || /^https?:\/\/\S+$/i.test(value),
    "Paste the full link, starting with https://.",
  )
  .optional();

export const settingsSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    timezone: z.string().trim().min(1).max(80),
    tracker_online_threshold_minutes: z.coerce.number().int().min(1).max(60),
    tracker_delayed_threshold_minutes: z.coerce.number().int().min(2).max(240),
    location_retention_days: z.coerce.number().int().min(1).max(3650),
    gps_provider: z.enum(["simulator", "traccar"]),
    reservation_fee: z.coerce
      .number()
      .min(1, "Enter a reservation fee of at least ₱1.")
      .max(1_000_000),
    // Empty: with-driver bookings go through and staff quote the driver.
    driver_daily_rate: z.preprocess(
      (value) =>
        value === "" || value == null || Number.isNaN(value) ? null : value,
      z.coerce
        .number()
        .min(0, "The driver rate cannot be negative.")
        .max(1_000_000)
        .nullable(),
    ),
    driver_hours_per_day: z.coerce
      .number()
      .int("Use whole hours.")
      .min(1, "A driver day covers at least 1 hour.")
      .max(24, "A driver day covers at most 24 hours."),
    // Empty: no overtime rate is shown to renters.
    driver_overtime_hourly_rate: optionalFee("The overtime rate cannot be negative."),
    // Per way. Empty: deliveries go through and staff quote the fee.
    delivery_fee_within_city: optionalFee("The delivery fee cannot be negative."),
    delivery_fee_outside_city: optionalFee("The delivery fee cannot be negative."),
    free_cancellation_hours: z.coerce
      .number()
      .int("Use whole hours.")
      .min(0)
      .max(720, "Keep the window under 30 days (720 hours)."),
    // Kept free before and after every rental of a car: washing, checks.
    turnaround_minutes: z.coerce
      .number()
      .int("Use whole minutes.")
      .min(0, "The turnaround cannot be negative.")
      .max(1440, "Keep the turnaround under a day (1,440 minutes)."),
    payment_instructions: z.string().trim().max(2000).optional(),
    operating_address: z
      .string()
      .trim()
      .max(300, "Keep the address under 300 characters.")
      .optional(),
    review_google_url: reviewLink,
    review_facebook_url: reviewLink,
    review_thank_you_message: z
      .string()
      .trim()
      .max(1000, "Keep the message under 1,000 characters.")
      .optional(),
    contact_phone: phoneChannel,
    contact_whatsapp: phoneChannel,
    contact_viber: phoneChannel,
    contact_wechat: handleChannel,
    contact_kakaotalk: handleChannel,
    contact_line: handleChannel,
    contact_telegram: handleChannel,
    contact_messenger: handleChannel,
    contact_facebook: handleChannel,
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
