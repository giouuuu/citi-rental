import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import {
  CONTACT_CHANNEL_KEYS,
  contactChannelField,
} from "@/features/settings/lib/contact-channels";

type ContactChannelFields = Record<
  ReturnType<typeof contactChannelField>,
  string
>;

const CONTACT_COLUMNS = CONTACT_CHANNEL_KEYS.map(contactChannelField);

const emptyContactChannels = Object.fromEntries(
  CONTACT_COLUMNS.map((column) => [column, ""]),
) as ContactChannelFields;

export type OrganizationSettings = {
  name: string;
  timezone: string;
  tracker_online_threshold_minutes: number;
  tracker_delayed_threshold_minutes: number;
  location_retention_days: number;
  gps_provider: string;
  reservation_fee: number;
  /** Per day on with-driver bookings; null when staff quote the driver. */
  driver_daily_rate: number | null;
  free_cancellation_hours: number;
  payment_qr_url: string;
  payment_instructions: string;
} & ContactChannelFields;

export async function getOrganizationSettings(): Promise<OrganizationSettings> {
  if (!isSupabaseConfigured())
    return {
      name: "Zeke Car Rentals",
      timezone: "Asia/Manila",
      tracker_online_threshold_minutes: 5,
      tracker_delayed_threshold_minutes: 15,
      location_retention_days: 90,
      gps_provider: "simulator",
      reservation_fee: 500,
      driver_daily_rate: null,
      free_cancellation_hours: 24,
      payment_qr_url: "",
      payment_instructions: "",
      ...emptyContactChannels,
    };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) throw new Error("Unauthorized");
  const { data: company, error } = await supabase
    .from("company_profile")
    .select(
      [
        "name, timezone, reservation_fee, driver_daily_rate, free_cancellation_hours, payment_qr_url, payment_instructions",
        ...CONTACT_COLUMNS,
      ].join(", "),
    )
    .single();
  if (error) throw new Error(error.message);
  const { data: appSettings } = await supabase
    .from("app_settings")
    .select("setting_key, setting_value")
    .in("setting_key", [
      "tracker.online_threshold_minutes",
      "tracker.delayed_threshold_minutes",
      "location.retention_days",
      "gps.provider",
    ]);
  const organization = company as unknown as {
    name: string;
    timezone: string;
    reservation_fee: number | null;
    driver_daily_rate: number | null;
    free_cancellation_hours: number | null;
    payment_qr_url: string | null;
    payment_instructions: string | null;
  } & Record<(typeof CONTACT_COLUMNS)[number], string | null>;
  const values = new Map(
    (appSettings ?? []).map((setting) => [
      setting.setting_key,
      setting.setting_value,
    ]),
  );
  return {
    name: organization.name,
    timezone: organization.timezone,
    tracker_online_threshold_minutes: Number(
      values.get("tracker.online_threshold_minutes") ?? 5,
    ),
    tracker_delayed_threshold_minutes: Number(
      values.get("tracker.delayed_threshold_minutes") ?? 15,
    ),
    location_retention_days: Number(
      values.get("location.retention_days") ?? 90,
    ),
    gps_provider: String(
      values.get("gps.provider") ?? process.env.GPS_PROVIDER ?? "simulator",
    ),
    reservation_fee: Number(organization.reservation_fee ?? 500),
    driver_daily_rate:
      organization.driver_daily_rate == null
        ? null
        : Number(organization.driver_daily_rate),
    free_cancellation_hours: Number(
      organization.free_cancellation_hours ?? 24,
    ),
    payment_qr_url: organization.payment_qr_url ?? "",
    payment_instructions: organization.payment_instructions ?? "",
    ...(Object.fromEntries(
      CONTACT_COLUMNS.map((column) => [column, organization[column] ?? ""]),
    ) as ContactChannelFields),
  };
}

export async function getIntegrationHealth() {
  const configured = {
    supabase: isSupabaseConfigured(),
    traccar: Boolean(
      process.env.TRACCAR_BASE_URL &&
        (process.env.TRACCAR_API_TOKEN || process.env.TRACCAR_USERNAME),
    ),
    provider: process.env.GPS_PROVIDER ?? "simulator",
    baseUrl: process.env.TRACCAR_BASE_URL ?? "Not configured",
  };
  if (!configured.supabase)
    return { ...configured, logs: [] as Record<string, unknown>[] };
  const supabase = await createClient();
  const { data } = await supabase
    .from("integration_sync_logs")
    .select(
      "id, provider, operation, status, started_at, completed_at, records_read, records_written, error_summary",
    )
    .order("started_at", { ascending: false })
    .limit(10);
  return {
    ...configured,
    logs: (data ?? []) as unknown as Record<string, unknown>[],
  };
}
