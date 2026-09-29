import "server-only";

import { demoOverview } from "@/features/analytics/lib/demo-analytics";
import { runAnalyticsRpc } from "@/features/analytics/services/run-analytics-rpc";
import type { AnalyticsOverview, AnalyticsResult } from "@/features/analytics/types/analytics";
import { buildDemoWorkspace } from "@/features/shared/lib/demo-workspace";
import { toMoney } from "@/features/shared/lib/money";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type OverviewRow = {
  bookings_created: number;
  bookings_public: number;
  bookings_ops: number;
  drafts_open: number;
  cancellations: number;
  completed_rentals: number;
  late_returns: number;
  overdue_now: number;
  collected: number | string;
  refunds: number | string;
  penalties_billed: number | string;
  outstanding_balance: number | string;
  rented_vehicle_days: number;
  fleet_vehicle_days: number;
  avg_rental_days: number | string | null;
  avg_lead_time_days: number | string | null;
  customers_total: number;
  customers_blocked: number;
  customers_active: number;
  customers_new: number;
  customers_returning: number;
};

function nullableNumber(value: number | string | null) {
  return value === null ? null : Number(value);
}

export async function getAnalyticsOverview(
  from: string,
  to: string,
): Promise<AnalyticsResult<AnalyticsOverview>> {
  if (!isSupabaseConfigured()) {
    return { ok: true, data: demoOverview(buildDemoWorkspace(), from, to) };
  }

  return runAnalyticsRpc<OverviewRow, AnalyticsOverview>(
    "analytics_overview",
    { p_from: from, p_to: to },
    ([row]) => ({
      bookingsCreated: Number(row?.bookings_created ?? 0),
      bookingsPublic: Number(row?.bookings_public ?? 0),
      bookingsOps: Number(row?.bookings_ops ?? 0),
      draftsOpen: Number(row?.drafts_open ?? 0),
      cancellations: Number(row?.cancellations ?? 0),
      completedRentals: Number(row?.completed_rentals ?? 0),
      lateReturns: Number(row?.late_returns ?? 0),
      overdueNow: Number(row?.overdue_now ?? 0),
      collected: toMoney(row?.collected),
      refunds: toMoney(row?.refunds),
      penaltiesBilled: toMoney(row?.penalties_billed),
      outstandingBalance: toMoney(row?.outstanding_balance),
      rentedVehicleDays: Number(row?.rented_vehicle_days ?? 0),
      fleetVehicleDays: Number(row?.fleet_vehicle_days ?? 0),
      avgRentalDays: nullableNumber(row?.avg_rental_days ?? null),
      avgLeadTimeDays: nullableNumber(row?.avg_lead_time_days ?? null),
      customersTotal: Number(row?.customers_total ?? 0),
      customersBlocked: Number(row?.customers_blocked ?? 0),
      customersActive: Number(row?.customers_active ?? 0),
      customersNew: Number(row?.customers_new ?? 0),
      customersReturning: Number(row?.customers_returning ?? 0),
    }),
  );
}
