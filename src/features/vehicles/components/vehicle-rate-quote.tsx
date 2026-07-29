import {
  formatPhp,
  quoteDeposit,
  quoteRentalTotal,
} from "@/features/vehicles/lib/rental-pricing";

type VehicleRateQuoteProps = {
  dailyRate: number;
  start?: string | null;
  end?: string | null;
  depositPercent?: number;
  className?: string;
};

export function VehicleRateQuote({
  dailyRate,
  start,
  end,
  depositPercent = 30,
  className,
}: VehicleRateQuoteProps) {
  const quote = quoteRentalTotal(dailyRate, start, end);
  const deposit = quote
    ? quoteDeposit(quote.total, depositPercent)
    : null;

  return (
    <div className={className}>
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold tabular-nums text-brand-950">
          {formatPhp(dailyRate)}
        </span>
        <span> / day</span>
      </p>
      {quote ? (
        <p className="mt-1 text-sm text-brand-950">
          <span className="font-bold tabular-nums">{formatPhp(quote.total)}</span>
          <span className="text-muted-foreground">
            {" "}
            for {quote.days} {quote.days === 1 ? "day" : "days"}
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
