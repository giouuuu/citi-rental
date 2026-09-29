import "server-only";

import { demoVehiclePerformance } from "@/features/analytics/lib/demo-analytics";
import { runAnalyticsRpc } from "@/features/analytics/services/run-analytics-rpc";
import type { AnalyticsResult, VehiclePerformance } from "@/features/analytics/types/analytics";
import { buildDemoWorkspace } from "@/features/shared/lib/demo-workspace";
import { toMoney } from "@/features/shared/lib/money";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type VehiclePerformanceRow = {
  vehicle_id: string;
  plate_number: string;
  name: string;
  category: string | null;
  status: string;
  daily_rate: number | string | null;
  rental_count: number;
  rented_days: number;
  window_days: number;
  collected: number | string;
  penalties_billed: number | string;
  last_return_at: string | null;
  next_start_at: string | null;
  on_rent_now: boolean;
};

export async function listVehiclePerformance(
  from: string,
  to: string,
): Promise<AnalyticsResult<VehiclePerformance[]>> {
  if (!isSupabaseConfigured()) {
    return { ok: true, data: demoVehiclePerformance(buildDemoWorkspace(), from, to) };
  }

  return runAnalyticsRpc<VehiclePerformanceRow, VehiclePerformance[]>(
    "analytics_vehicle_performance",
    { p_from: from, p_to: to },
    (rows) =>
      rows.map((row) => ({
        vehicleId: row.vehicle_id,
        plateNumber: row.plate_number,
        name: row.name,
        category: row.category,
        status: row.status,
        dailyRate: row.daily_rate === null ? null : toMoney(row.daily_rate),
        rentalCount: Number(row.rental_count),
        rentedDays: Number(row.rented_days),
        windowDays: Number(row.window_days),
        collected: toMoney(row.collected),
        penaltiesBilled: toMoney(row.penalties_billed),
        lastReturnAt: row.last_return_at,
        nextStartAt: row.next_start_at,
        onRentNow: Boolean(row.on_rent_now),
      })),
  );
}
