import "server-only";

import { demoTimeseries } from "@/features/analytics/lib/demo-analytics";
import { runAnalyticsRpc } from "@/features/analytics/services/run-analytics-rpc";
import type {
  AnalyticsBucket,
  AnalyticsResult,
  AnalyticsTimeseriesPoint,
} from "@/features/analytics/types/analytics";
import { buildDemoWorkspace } from "@/features/shared/lib/demo-workspace";
import { toMoney } from "@/features/shared/lib/money";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type TimeseriesRow = {
  bucket_start: string;
  collected: number | string;
  penalties_billed: number | string;
  bookings_created: number;
  bookings_public: number;
  cancellations: number;
  rented_vehicle_days: number;
  fleet_vehicle_days: number;
};

export async function getAnalyticsTimeseries(
  from: string,
  to: string,
  bucket: AnalyticsBucket,
): Promise<AnalyticsResult<AnalyticsTimeseriesPoint[]>> {
  if (!isSupabaseConfigured()) {
    return { ok: true, data: demoTimeseries(buildDemoWorkspace(), from, to, bucket) };
  }

  return runAnalyticsRpc<TimeseriesRow, AnalyticsTimeseriesPoint[]>(
    "analytics_timeseries",
    { p_from: from, p_to: to, p_bucket: bucket },
    (rows) =>
      rows.map((row) => ({
        bucketStart: String(row.bucket_start).slice(0, 10),
        collected: toMoney(row.collected),
        penaltiesBilled: toMoney(row.penalties_billed),
        bookingsCreated: Number(row.bookings_created),
        bookingsPublic: Number(row.bookings_public),
        cancellations: Number(row.cancellations),
        rentedVehicleDays: Number(row.rented_vehicle_days),
        fleetVehicleDays: Number(row.fleet_vehicle_days),
      })),
  );
}
