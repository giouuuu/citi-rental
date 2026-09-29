import { utilizationPercent } from "@/features/analytics/lib/analytics-metrics";
import type {
  AnalyticsBucket,
  AnalyticsTimeseriesPoint,
} from "@/features/analytics/types/analytics";
import { formatDateKey } from "@/features/shared/lib/manila-time";

/** One chart row. Plain numbers only — it crosses to a Client Component. */
export type TrendRow = {
  label: string;
  bucketStart: string;
  collected: number;
  website: number;
  frontDesk: number;
  cancellations: number;
  utilization: number | null;
};

export function bucketLabel(bucketStart: string, bucket: AnalyticsBucket): string {
  if (bucket === "month") return formatDateKey(bucketStart, "month");
  return formatDateKey(bucketStart, "day");
}

export function toTrendRows(
  points: AnalyticsTimeseriesPoint[],
  bucket: AnalyticsBucket,
): TrendRow[] {
  return points.map((point) => ({
    label: bucketLabel(point.bucketStart, bucket),
    bucketStart: point.bucketStart,
    collected: point.collected,
    website: point.bookingsPublic,
    frontDesk: Math.max(0, point.bookingsCreated - point.bookingsPublic),
    cancellations: point.cancellations,
    utilization: utilizationPercent(point.rentedVehicleDays, point.fleetVehicleDays),
  }));
}

/** Booked share of fleet-days over the first `days` rows of a forward series. */
export function forwardBookedPercent(points: AnalyticsTimeseriesPoint[], days: number) {
  const slice = points.slice(0, days);
  return utilizationPercent(
    slice.reduce((sum, point) => sum + point.rentedVehicleDays, 0),
    slice.reduce((sum, point) => sum + point.fleetVehicleDays, 0),
  );
}
