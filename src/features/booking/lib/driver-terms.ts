import { formatPhp } from "@/features/shared/lib/money";

/**
 * Settings → driver: the day rate buys `hoursPerDay` of driving; each hour
 * past that is `overtimeRate`, which the owner settles at return, so it is
 * never in a booking's total.
 */
export type DriverTerms = {
  /** Null: staff quote the driver. */
  dailyRate: number | null;
  hoursPerDay: number;
  /** Null: no overtime rate to show. */
  overtimeRate: number | null;
};

export const DEFAULT_DRIVER_HOURS = 10;

export const NO_DRIVER_TERMS: DriverTerms = {
  dailyRate: null,
  hoursPerDay: DEFAULT_DRIVER_HOURS,
  overtimeRate: null,
};

const dayWord = (days: number) => (days === 1 ? "day" : "days");

/** "Driver (3 days)" */
export function driverLineLabel(days: number | null | undefined) {
  return days ? `Driver (${days} ${dayWord(days)})` : "Driver";
}

/** "₱1,500 a day, for up to 10 hours of driving each day" */
export function driverDayNote(
  rate: number,
  terms: Pick<DriverTerms, "hoursPerDay"> | null | undefined,
) {
  const hours = terms?.hoursPerDay ?? DEFAULT_DRIVER_HOURS;
  return `${formatPhp(rate)} a day, for up to ${hours} hours of driving each day`;
}

/**
 * The bill line for driving past the day's hours: a price per hour, never in
 * the total. Null with no overtime rate.
 */
export function driverExtraHoursLine(
  terms: Pick<DriverTerms, "hoursPerDay" | "overtimeRate"> | null | undefined,
) {
  if (!terms?.overtimeRate) return null;
  return {
    label: "Extra driving hours",
    amount: `${formatPhp(terms.overtimeRate)} / hour`,
    detail: `Only if the driver drives more than ${terms.hoursPerDay} hours in one day. This is not in your total. You pay it when you return the car.`,
  };
}
