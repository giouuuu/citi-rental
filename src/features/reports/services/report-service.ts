import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type ReportSummary = {
  activeRentals: number;
  overdueRentals: number;
  returnsDueToday: number;
  revenueThisMonth: number;
};

function startOfMonth(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
}

function endOfDay(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59),
  ).toISOString();
}

export async function getReportSummary(): Promise<ReportSummary> {
  if (!isSupabaseConfigured())
    return {
      activeRentals: 11,
      overdueRentals: 1,
      returnsDueToday: 3,
      revenueThisMonth: 148_500,
    };

  const supabase = await createClient();
  const now = new Date();
  const nowIso = now.toISOString();

  const [active, overdue, dueToday, revenue] = await Promise.all([
    supabase
      .from("rentals")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    // Counts stored `overdue` plus active rentals already past due, so the
    // number agrees with isRentalOverdue() even between sweeps.
    supabase
      .from("rentals")
      .select("id", { count: "exact", head: true })
      .or(`status.eq.overdue,and(status.eq.active,expected_return_at.lt.${nowIso})`),
    supabase
      .from("rentals")
      .select("id", { count: "exact", head: true })
      .in("status", ["active", "overdue"])
      .lte("expected_return_at", endOfDay(now)),
    supabase
      .from("payments")
      .select("amount, payment_type")
      .eq("status", "confirmed")
      .gte("confirmed_at", startOfMonth(now)),
  ]);

  const revenueThisMonth = (revenue.data ?? []).reduce((total, row) => {
    const amount = Number(row.amount) || 0;
    return row.payment_type === "refund" ? total - amount : total + amount;
  }, 0);

  return {
    activeRentals: active.count ?? 0,
    overdueRentals: overdue.count ?? 0,
    returnsDueToday: dueToday.count ?? 0,
    revenueThisMonth: Math.round(revenueThisMonth * 100) / 100,
  };
}
