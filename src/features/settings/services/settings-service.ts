import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type OrganizationSettings = {
  name: string;
  timezone: string;
  tracker_online_threshold_minutes: number;
  tracker_delayed_threshold_minutes: number;
  location_retention_days: number;
  gps_provider: string;
  deposit_percent: number;
  payment_qr_url: string;
  payment_instructions: string;
};

export async function getOrganizationSettings(): Promise<OrganizationSettings> {
  if (!isSupabaseConfigured())
    return {
      name: "Northline Rentals",
      timezone: "Asia/Manila",
      tracker_online_threshold_minutes: 5,
      tracker_delayed_threshold_minutes: 15,
      location_retention_days: 90,
      gps_provider: "simulator",
      deposit_percent: 30,
      payment_qr_url: "",
      payment_instructions: "",
    };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) throw new Error("Unauthorized");
  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "organization_id, organizations(name, timezone, deposit_percent, payment_qr_url, payment_instructions)",
    )
    .eq("id", claims.claims.sub)
    .single();
  if (error) throw new Error(error.message);
  const { data: appSettings } = await supabase
    .from("app_settings")
    .select("setting_key, setting_value")
    .eq("organization_id", profile.organization_id)
    .in("setting_key", [
      "tracker.online_threshold_minutes",
      "tracker.delayed_threshold_minutes",
      "location.retention_days",
      "gps.provider",
    ]);
  const organization = profile.organizations as unknown as {
    name: string;
    timezone: string;
    deposit_percent: number | null;
    payment_qr_url: string | null;
    payment_instructions: string | null;
  };
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
    deposit_percent: Number(organization.deposit_percent ?? 30),
    payment_qr_url: organization.payment_qr_url ?? "",
    payment_instructions: organization.payment_instructions ?? "",
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
