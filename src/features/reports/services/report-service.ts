import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type ReportSummary = {
  activeRentals: number;
  overdueRentals: number;
  unresolvedAlerts: number;
  offlineTrackers: number;
};

export async function getReportSummary(): Promise<ReportSummary> {
  if (!isSupabaseConfigured())
    return {
      activeRentals: 11,
      overdueRentals: 1,
      unresolvedAlerts: 3,
      offlineTrackers: 2,
    };
  const supabase = await createClient();
  const [active, overdue, alerts, offline] = await Promise.all([
    supabase
      .from("rentals")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("rentals")
      .select("id", { count: "exact", head: true })
      .eq("status", "overdue"),
    supabase
      .from("tracking_events")
      .select("id", { count: "exact", head: true })
      .eq("is_acknowledged", false),
    supabase
      .from("gps_devices")
      .select("id", { count: "exact", head: true })
      .eq("status", "offline")
      .eq("is_active", true),
  ]);
  return {
    activeRentals: active.count ?? 0,
    overdueRentals: overdue.count ?? 0,
    unresolvedAlerts: alerts.count ?? 0,
    offlineTrackers: offline.count ?? 0,
  };
}
