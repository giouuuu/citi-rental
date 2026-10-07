import { describeBilledTime, type RentRates } from "@/features/rentals/lib/rent-pricing";
import {
  formatPhp,
  quoteDeposit,
  quoteRentalTotal,
} from "@/features/vehicles/lib/rental-pricing";

type VehicleRateQuoteProps = {
  rates: RentRates;
  start?: string | null;
  end?: string | null;
  depositPercent?: number;
  className?: string;
};

export function VehicleRateQuote({
  rates,
  start,
  end,
  depositPercent = 30,
  className,
}: VehicleRateQuoteProps) {
  const quote = quoteRentalTotal(rates, start, end);
  const deposit = quote
    ? quoteDeposit(quote.total, depositPercent)
    : null;
  const shortRates = [
    rates.halfDay ? `${formatPhp(rates.halfDay)} / 12 hrs` : null,
    rates.hourly ? `${formatPhp(rates.hourly)} / hr` : null,
  ].filter(Boolean);

  return (
    <div className={className}>
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold tabular-nums text-brand-950">
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
          Deposit to confirm:{" "}
          <span className="font-semibold text-brand-950">
            {formatPhp(deposit.deposit)}
          </span>{" "}
          ({deposit.percent}%)
        </p>
      ) : null}
    </div>
  );
}
