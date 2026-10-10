import {
  driverDays,
  quoteRent,
  type RentQuote,
  type RentRates,
} from "@/features/rentals/lib/rent-pricing";
import {
  parseDateKey,
  parseManilaDateTimeInput,
  parseManilaTimestamp,
} from "@/features/shared/lib/manila-time";

export { formatPhp } from "@/features/shared/lib/money";
export { driverDays };

/** A bare search day gets the booking form's default pick-up and return times. */
const DEFAULT_TIME = "09:00";
const SAME_DAY_RETURN_TIME = "18:00";

function toInstant(value: string, fallbackTime: string) {
  const trimmed = value.trim();
  const key = parseDateKey(trimmed);
  return key
    ? parseManilaDateTimeInput(`${key}T${fallbackTime}`)
    : parseManilaTimestamp(trimmed);
}

function tripInstants(start?: string | null, end?: string | null) {
  if (!start?.trim() || !end?.trim()) return null;
  const sameDay = Boolean(parseDateKey(start.trim())) && start.trim() === end.trim();
  const startAt = toInstant(start, DEFAULT_TIME);
  const returnAt = toInstant(end, sameDay ? SAME_DAY_RETURN_TIME : DEFAULT_TIME);
  return startAt && returnAt ? { startAt, returnAt } : null;
}

/**
 * The rent a customer will be quoted for a search or a picked trip: a date
 * key, a `YYYY-MM-DDTHH:mm` picker value, or a stored timestamp at each end.
 * Null when either end is missing or the return is not after pick-up.
 */
export function quoteRentalTotal(
  rates: RentRates,
  start?: string | null,
  end?: string | null,
): RentQuote | null {
  const trip = tripInstants(start, end);
  return trip ? quoteRent(trip.startAt, trip.returnAt, rates) : null;
}

export type TripQuote = {
  rent: RentQuote;
  /** Present when the trip has a driver. */
  driver: { days: number; rate: number | null; fee: number } | null;
  /** Rent plus the driver fee. */
  total: number;
};

/**
 * The whole trip as `create_public_booking` will price it: the car's rent,
 * plus the driver's day rate when the customer wants a driver. A driver with
 * no rate set adds nothing here; staff quote it when they confirm.
 */
export function quoteTrip(
  rates: RentRates,
  start?: string | null,
  end?: string | null,
  withDriver?: { rate: number | null } | null,
): TripQuote | null {
  const trip = tripInstants(start, end);
  const rent = trip ? quoteRent(trip.startAt, trip.returnAt, rates) : null;
  if (!trip || !rent) return null;
  if (!withDriver) return { rent, driver: null, total: rent.total };
  const days = driverDays(trip.startAt, trip.returnAt);
  const fee = Math.round((withDriver.rate ?? 0) * days * 100) / 100;
  return {
    rent,
    driver: { days, rate: withDriver.rate, fee },
    total: rent.total + fee,
  };
}

/** The flat reservation fee to hold a booking, never more than the trip. */
export function quoteReservationFee(total: number, fee: number) {
  const deposit = Math.min(fee, total);
  return {
    deposit,
    balance: Math.max(0, total - deposit),
  };
}
