import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import {
  manilaDateKey,
  manilaDayEnd,
  manilaDayStart,
} from "@/features/shared/lib/manila-time";

export type ReportSummary = {
  activeRentals: number;
  overdueRentals: number;
  returnsDueToday: number;
  revenueThisMonth: number;
};

// Manila boundaries: a UTC month or day starts eight hours late on the floor.
function startOfMonth(now: Date): string {
  return manilaDayStart(`${manilaDateKey(now).slice(0, 7)}-01`).toISOString();
}

function endOfDay(now: Date): string {
  return new Date(manilaDayEnd(manilaDateKey(now)).getTime() - 1000).toISOString();
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

  // Penalties are accrued charges, not money received — the customer's
  // settlement arrives later as a balance row. Counting both double-counts.
  const revenueThisMonth = (revenue.data ?? []).reduce((total, row) => {
    const amount = Number(row.amount) || 0;
    if (row.payment_type === "penalty") return total;
    return row.payment_type === "refund" ? total - amount : total + amount;
  }, 0);

  return {
    activeRentals: active.count ?? 0,
    overdueRentals: overdue.count ?? 0,
    returnsDueToday: dueToday.count ?? 0,
    revenueThisMonth: Math.round(revenueThisMonth * 100) / 100,
  };
}
