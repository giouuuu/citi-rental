import {
  quoteRent,
  quoteRentForHours,
  type RentQuote,
  type RentRates,
} from "@/features/rentals/lib/rent-pricing";

const round = (value: number) => Math.round(value * 100) / 100;

/** The rentals columns a quote writes: the snapshot rates and the billed time. */
export function rentalQuoteColumns(quote: RentQuote, rates: RentRates) {
  return {
    quoted_daily_rate: rates.daily,
    quoted_half_day_rate: rates.halfDay ?? null,
    quoted_hourly_rate: rates.hourly ?? null,
    quoted_days: quote.days,
    quoted_hours: quote.hours,
    quoted_total: quote.total,
  };
}

/** A rental's rent for its dates, written as rentals columns; null when the dates are invalid. */
export function quoteRentalDates(startAt: Date, returnAt: Date, rates: RentRates) {
  const quote = quoteRent(startAt, returnAt, rates);
  return quote ? rentalQuoteColumns(quote, rates) : null;
}

/**
 * Re-prices the time already booked at new rates. Rentals quoted before
 * elapsed-time pricing (no billed hours) keep their calendar days.
 */
export function requoteBookedTime(
  booked: { days: number; hours: number | null },
  rates: RentRates,
) {
  if (booked.hours == null) {
    return {
      quoted_daily_rate: rates.daily,
      quoted_total: round(rates.daily * booked.days),
    };
  }
  return rentalQuoteColumns(quoteRentForHours(booked.days * 24 + booked.hours, rates), rates);
}

/**
 * What moving the return later adds to the rent: the longer trip's price
 * less the booked one, so a few extra hours bill as hours, not a day.
 */
export function extensionCharge(
  startAt: Date,
  currentReturnAt: Date,
  newReturnAt: Date,
  rates: RentRates,
): { current: RentQuote; next: RentQuote; amount: number } | null {
  const current = quoteRent(startAt, currentReturnAt, rates);
  const next = quoteRent(startAt, newReturnAt, rates);
  if (!current || !next) return null;
  return { current, next, amount: Math.max(0, round(next.total - current.total)) };
}
