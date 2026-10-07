import { formatPhpExact } from "@/features/shared/lib/money";

/**
 * Rent is priced on the time the car is out, not the calendar days it
 * touches. Same rule as private.rental_rent_quote, which prices online
 * bookings, so a car costs the same online and at the counter.
 *
 *   1. Hours out = pick-up to return, rounded up to the next whole hour.
 *   2. Every 24 hours costs the daily rate.
 *   3. Leftover hours cost the cheapest of: one more day, the 12-hour rate
 *      (up to 12 hours), the 12-hour rate plus hourly past 12, or hourly.
 */
export type RentRates = {
  daily: number;
  /** Price for up to 12 hours; null when the car has none. */
  halfDay?: number | null;
  /** Price per hour; null when the car has none. */
  hourly?: number | null;
};

export type LeftoverPrice =
  | { kind: "none"; amount: 0 }
  | { kind: "day"; amount: number }
  | { kind: "half_day"; amount: number }
  | { kind: "hourly"; hours: number; amount: number }
  | { kind: "half_day_plus_hours"; extraHours: number; amount: number };

export type RentQuote = {
  /** Whole 24-hour days. */
  days: number;
  /** Hours past the whole days, 0–23. */
  hours: number;
  leftover: LeftoverPrice;
  total: number;
};

const HOUR_MS = 3_600_000;
const HALF_DAY_HOURS = 12;

const round = (value: number) => Math.round(value * 100) / 100;
const positive = (value: number | null | undefined): value is number =>
  value != null && Number.isFinite(value) && value > 0;

/** Hours billed for a trip, rounded up; null when the return is not after pick-up. */
export function billedHours(startAt: Date, returnAt: Date): number | null {
  const ms = returnAt.getTime() - startAt.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.ceil(ms / HOUR_MS);
}

/** The cheapest way to bill `hours` (1–23) past the whole days. */
export function priceLeftoverHours(hours: number, rates: RentRates): LeftoverPrice {
  if (hours <= 0) return { kind: "none", amount: 0 };

  // Earlier entries win ties, so equal prices read as the simpler line.
  const options: LeftoverPrice[] = [{ kind: "day", amount: rates.daily }];
  if (positive(rates.halfDay) && hours <= HALF_DAY_HOURS) {
    options.push({ kind: "half_day", amount: rates.halfDay });
  }
  if (positive(rates.hourly)) {
    options.push({ kind: "hourly", hours, amount: round(hours * rates.hourly) });
  }
  if (positive(rates.halfDay) && positive(rates.hourly) && hours > HALF_DAY_HOURS) {
    const extraHours = hours - HALF_DAY_HOURS;
    options.push({
      kind: "half_day_plus_hours",
      extraHours,
      amount: round(rates.halfDay + extraHours * rates.hourly),
    });
  }

  return options.reduce((best, option) => (option.amount < best.amount ? option : best));
}

/** The rent for a trip, or null when the return is not after pick-up. */
export function quoteRent(startAt: Date, returnAt: Date, rates: RentRates): RentQuote | null {
  const totalHours = billedHours(startAt, returnAt);
  if (totalHours == null) return null;
  return quoteRentForHours(totalHours, rates);
}

export function quoteRentForHours(totalHours: number, rates: RentRates): RentQuote {
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const leftover = priceLeftoverHours(hours, rates);
  return { days, hours, leftover, total: round(days * rates.daily + leftover.amount) };
}

function plural(count: number, singular: string, pluralWord = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralWord}`;
}

/** "₱1,350 × 3 days + 12-hour ₱900 + 2 hours × ₱150" */
export function describeRent(quote: RentQuote, rates: RentRates): string {
  const { leftover } = quote;
  // A leftover billed as a full day reads as one more day.
  const dayCount = quote.days + (leftover.kind === "day" ? 1 : 0);
  const parts: string[] = [];
  if (dayCount > 0) parts.push(`${formatPhpExact(rates.daily)} × ${plural(dayCount, "day")}`);
  if (leftover.kind === "half_day" || leftover.kind === "half_day_plus_hours") {
    parts.push(`12-hour ${formatPhpExact(rates.halfDay ?? 0)}`);
  }
  if (leftover.kind === "hourly") {
    parts.push(`${plural(leftover.hours, "hour")} × ${formatPhpExact(rates.hourly ?? 0)}`);
  }
  if (leftover.kind === "half_day_plus_hours") {
    parts.push(`${plural(leftover.extraHours, "hour")} × ${formatPhpExact(rates.hourly ?? 0)}`);
  }
  return parts.join(" + ");
}

/** "3 days 5 hours" — the billed time, not the priced units. */
export function describeBilledTime(quote: Pick<RentQuote, "days" | "hours">): string {
  return [
    quote.days ? plural(quote.days, "day") : null,
    quote.hours ? plural(quote.hours, "hour") : null,
  ]
    .filter(Boolean)
    .join(" ");
}
