import {
  driverDays,
  quoteDayRent,
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

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Customers are quoted per started 24 hours, so only the daily rate counts. */
type CustomerRates = Pick<RentRates, "daily">;

/**
 * The rent a customer will be quoted for a search or a picked trip: a date
 * key, a `YYYY-MM-DDTHH:mm` picker value, or a stored timestamp at each end.
 * Null when either end is missing or the return is not after pick-up.
 */
export function quoteRentalTotal(
  rates: CustomerRates,
  start?: string | null,
  end?: string | null,
): RentQuote | null {
  const trip = tripInstants(start, end);
  return trip ? quoteDayRent(trip.startAt, trip.returnAt, rates.daily) : null;
}

export type TripQuote = {
  rent: RentQuote;
  /** Present when the trip has a driver. */
  driver: { days: number; rate: number | null; fee: number } | null;
  /** Delivery plus collection; 0 when the car changes hands at the office. */
  delivery: number;
  /** Fees added to every online booking. */
  fees: number;
  /** Rent plus the driver, delivery and booking fees. */
  total: number;
};

/**
 * The whole trip as `create_public_booking` will price it: the car's rent,
 * plus the driver's day rate when the customer wants a driver, plus delivery
 * and collection (already summed per way), plus the fees added to every
 * booking (already summed). A driver with no rate set adds
 * nothing here; staff quote it when they confirm.
 */
export function quoteTrip(
  rates: CustomerRates,
  start?: string | null,
  end?: string | null,
  withDriver?: { rate: number | null } | null,
  delivery = 0,
  fees = 0,
): TripQuote | null {
  const trip = tripInstants(start, end);
  const rent = trip ? quoteDayRent(trip.startAt, trip.returnAt, rates.daily) : null;
  if (!trip || !rent) return null;
  const driver = withDriver
    ? (() => {
        const days = driverDays(trip.startAt, trip.returnAt);
        return { days, rate: withDriver.rate, fee: round2((withDriver.rate ?? 0) * days) };
      })()
    : null;
  return {
    rent,
    driver,
    delivery,
    fees,
    total: round2(rent.total + (driver?.fee ?? 0) + delivery + fees),
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
