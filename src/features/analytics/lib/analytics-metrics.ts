import type { AnalyticsOverview, VehiclePerformance } from "@/features/analytics/types/analytics";

const DAY_MS = 86_400_000;

/** Whole percent, or null when the denominator is empty. */
export function percent(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 100);
}

/** Share of available fleet-days that were rented, capped at 100. */
export function utilizationPercent(rentedDays: number, fleetDays: number): number | null {
  const value = percent(rentedDays, fleetDays);
  return value === null ? null : Math.min(100, value);
}

export type Delta = { direction: "up" | "down" | "flat"; percent: number | null };

/**
 * Period-over-period change. A zero previous value has no meaningful
 * percentage, so the direction is still reported but the percent is null.
 */
export function periodDelta(current: number, previous: number): Delta {
  if (current === previous) return { direction: "flat", percent: 0 };
  const direction = current > previous ? "up" : "down";
  if (!previous) return { direction, percent: null };
  return { direction, percent: Math.round(((current - previous) / Math.abs(previous)) * 100) };
}

/** Collected revenue divided by the fleet-days it could have earned on. */
export function revenuePerFleetDay(overview: Pick<AnalyticsOverview, "collected" | "fleetVehicleDays">) {
  if (!overview.fleetVehicleDays) return null;
  return Math.round((overview.collected / overview.fleetVehicleDays) * 100) / 100;
}

/** Share of active customers who had rented before this window. */
export function repeatCustomerRate(overview: Pick<AnalyticsOverview, "customersActive" | "customersReturning">) {
  return percent(overview.customersReturning, overview.customersActive);
}

/** Cancellations as a share of bookings created in the same window. */
export function cancellationRate(overview: Pick<AnalyticsOverview, "cancellations" | "bookingsCreated">) {
  return percent(overview.cancellations, overview.bookingsCreated);
}

/** Late returns as a share of rentals completed in the window. */
export function lateReturnRate(overview: Pick<AnalyticsOverview, "lateReturns" | "completedRentals">) {
  return percent(overview.lateReturns, overview.completedRentals);
}

/** Whole days since a vehicle last came back, or null if it never has. */
export function daysIdle(lastReturnAt: string | null, now: Date = new Date()): number | null {
  if (!lastReturnAt) return null;
  const returned = new Date(lastReturnAt).getTime();
  if (!Number.isFinite(returned)) return null;
  return Math.max(0, Math.floor((now.getTime() - returned) / DAY_MS));
}

/** Policy: a car that has sat this long with nothing booked needs a look. */
export const IDLE_VEHICLE_THRESHOLD_DAYS = 14;

/**
 * Vehicles earning least: bookable (status available) cars that are not out
 * or booked right now and have been idle past the threshold or never rented.
 * Sorted longest-idle first, never-rented cars leading.
 */
export function idleVehicles(
  rows: VehiclePerformance[],
  now: Date = new Date(),
): (VehiclePerformance & { idleDays: number | null })[] {
  return rows
    .filter((row) => row.status === "available" && !row.onRentNow && !row.nextStartAt)
    .map((row) => ({ ...row, idleDays: daysIdle(row.lastReturnAt, now) }))
    .filter((row) => row.idleDays === null || row.idleDays >= IDLE_VEHICLE_THRESHOLD_DAYS)
    .sort((a, b) => (b.idleDays ?? Infinity) - (a.idleDays ?? Infinity));
}

/** Change between two percentages, in percentage points. */
export function pointsDelta(current: number | null, previous: number | null): Delta | null {
  if (current === null || previous === null) return null;
  const diff = current - previous;
  if (diff === 0) return { direction: "flat", percent: 0 };
  return { direction: diff > 0 ? "up" : "down", percent: diff };
}
