/** Values staff type when they don't know a car's make or model yet. */
const PLACEHOLDER_VALUES = new Set(["", "na", "n/a", "none", "-", "tbd", "unknown"]);

/** The trimmed value, or null when it is blank or a placeholder ("NA"). */
export function realVehicleValue(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return PLACEHOLDER_VALUES.has(trimmed.toLowerCase()) ? null : trimmed;
}

/** A model year worth showing; 0 or junk reads as not provided. */
export function realVehicleYear(year: number | null | undefined) {
  return typeof year === "number" && Number.isInteger(year) && year >= 1950 && year <= 2100
    ? year
    : null;
}

/**
 * "2026 Toyota Avanza", skipping placeholder make/model ("NA") and a missing
 * year: "2026 model" when only the year is real, null when nothing is.
 */
export function vehicleModelLine(vehicle: {
  make?: string | null;
  model?: string | null;
  year?: number | null;
}) {
  const makeModel = [realVehicleValue(vehicle.make), realVehicleValue(vehicle.model)]
    .filter(Boolean)
    .join(" ");
  const year = realVehicleYear(vehicle.year);
  if (makeModel) return year ? `${year} ${makeModel}` : makeModel;
  return year ? `${year} model` : null;
}
