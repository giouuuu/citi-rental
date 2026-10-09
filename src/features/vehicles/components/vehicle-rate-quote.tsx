import { cn } from "@/lib/utils";
import { describeBilledTime, type RentRates } from "@/features/rentals/lib/rent-pricing";
import {
  formatPhp,
  quoteRentalTotal,
  quoteReservationFee,
} from "@/features/vehicles/lib/rental-pricing";

type VehicleRateQuoteProps = {
  rates: RentRates;
  start?: string | null;
  end?: string | null;
  /** Flat fee to hold the booking; omit to hide the line. */
  reservationFee?: number | null;
  className?: string;
  /** Extra classes for the daily price figure, e.g. a larger display size. */
  priceClassName?: string;
};

export function VehicleRateQuote({
  rates,
  start,
  end,
  reservationFee,
  className,
  priceClassName,
}: VehicleRateQuoteProps) {
  const quote = quoteRentalTotal(rates, start, end);
  const deposit =
    quote && reservationFee
      ? quoteReservationFee(quote.total, reservationFee)
      : null;
  const shortRates = [
    rates.halfDay ? `${formatPhp(rates.halfDay)} / 12 hrs` : null,
    rates.hourly ? `${formatPhp(rates.hourly)} / hr` : null,
  ].filter(Boolean);

  return (
    <div className={className}>
      <p className="text-sm text-muted-foreground">
        <span className={cn("font-semibold tabular-nums text-brand-950", priceClassName)}>
          {formatPhp(rates.daily)}
        </span>
        <span> / day</span>
        {shortRates.length > 0 ? (
          <span className="tabular-nums"> · {shortRates.join(" · ")}</span>
        ) : null}
      </p>
      {quote ? (
        <p className="mt-1 text-sm text-brand-950">
          <span className="font-bold tabular-nums">{formatPhp(quote.total)}</span>
          <span className="text-muted-foreground">
            {" "}
            for {describeBilledTime(quote)}
          </span>
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
