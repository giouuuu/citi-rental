import { cn } from "@/lib/utils";
import {
  type BookingFeeLine,
  bookingFeesTotal,
} from "@/features/booking/lib/booking-fees";
import { describeBilledTime, type RentRates } from "@/features/rentals/lib/rent-pricing";
import {
  formatPhp,
  quoteReservationFee,
  quoteTrip,
} from "@/features/vehicles/lib/rental-pricing";

type VehicleRateQuoteProps = {
  /** Customers see the daily rate only; online trips bill per started 24 hours. */
  rates: Pick<RentRates, "daily">;
  start?: string | null;
  end?: string | null;
  /** Flat fee to hold the booking; omit to hide the line. */
  reservationFee?: number | null;
  /** Set when the trip has a driver: the owner's driver day rate, if any. */
  withDriver?: { rate: number | null } | null;
  /** Delivery plus collection fees, already summed. */
  delivery?: number;
  /** The car's charges for the driving mode (vehicleBookingFees). */
  bookingFees?: BookingFeeLine[];
  className?: string;
  /** Extra classes for the daily price figure, e.g. a larger display size. */
  priceClassName?: string;
};

export function VehicleRateQuote({
  rates,
  start,
  end,
  reservationFee,
  withDriver,
  delivery = 0,
  bookingFees = [],
  className,
  priceClassName,
}: VehicleRateQuoteProps) {
  const quote = quoteTrip(
    rates,
    start,
    end,
    withDriver,
    delivery,
    bookingFeesTotal(bookingFees),
  );
  const parts = quote
    ? [
        `Car ${formatPhp(quote.rent.total)}`,
        quote.driver?.rate != null
          ? `driver ${formatPhp(quote.driver.rate)} × ${quote.driver.days} ${quote.driver.days === 1 ? "day" : "days"}`
          : null,
        quote.delivery > 0 ? `delivery ${formatPhp(quote.delivery)}` : null,
        ...bookingFees.map((fee) => `${fee.name.toLowerCase()} ${formatPhp(fee.amount)}`),
      ].filter(Boolean)
    : [];
  const deposit =
    quote && reservationFee
      ? quoteReservationFee(quote.total, reservationFee)
      : null;

  return (
    <div className={className}>
      <p className="text-sm text-muted-foreground">
        <span className={cn("font-semibold tabular-nums text-brand-950", priceClassName)}>
          {formatPhp(rates.daily)}
        </span>
        <span> / day</span>
      </p>
      {quote ? (
        <p className="mt-1 text-sm text-brand-950">
          <span className="font-bold tabular-nums">{formatPhp(quote.total)}</span>
          <span className="text-muted-foreground">
            {" "}
            for {describeBilledTime(quote.rent)}
            {quote.driver ? " with a driver" : null}
          </span>
        </p>
      ) : null}
      {parts.length > 1 ? (
        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
          {parts.join(" + ")}
        </p>
      ) : null}
      {quote?.driver && quote.driver.rate == null ? (
        <p className="mt-0.5 text-xs text-muted-foreground">
          Driver fee confirmed by staff
        </p>
      ) : null}
      {deposit ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Reservation fee to confirm:{" "}
          <span className="font-semibold text-brand-950">
            {formatPhp(deposit.deposit)}
          </span>
        </p>
      ) : null}
    </div>
  );
}
