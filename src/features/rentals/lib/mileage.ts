/**
 * Kilometres a rental put on the car: the return odometer less the release
 * odometer (`rentals.km_driven`). Null until both readings exist.
 */
export function kmDriven(
  startingOdometer: number | null,
  endingOdometer: number | null,
): number | null {
  if (startingOdometer == null || endingOdometer == null) return null;
  return Math.max(0, Math.round((endingOdometer - startingOdometer) * 10) / 10);
}

/** "1,234 km", or "—" when there is no reading. */
export function formatKm(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("en-PH", { maximumFractionDigits: 1 })} km`;
}

export type MileageSummary = {
  totalKm: number;
  /** Trips with both readings; ones still out or missing a reading are left out. */
  trips: number;
  averageKm: number | null;
};

/** Totals km across trips, skipping those without both readings. */
export function summarizeMileage(values: (number | null | undefined)[]): MileageSummary {
  const driven = values.filter((value): value is number => value != null && Number.isFinite(value));
  const totalKm = Math.round(driven.reduce((sum, value) => sum + value, 0) * 10) / 10;
  return {
    totalKm,
    trips: driven.length,
    averageKm: driven.length ? Math.round((totalKm / driven.length) * 10) / 10 : null,
  };
}
