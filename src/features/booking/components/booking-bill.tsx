import {
  type BookingFeeLine,
  bookingFeesTotal,
} from "@/features/booking/lib/booking-fees";
import {
  type DriverTerms,
  driverDayNote,
  driverExtraHoursLine,
  driverLineLabel,
} from "@/features/booking/lib/driver-terms";
import {
  type DeliveryFees,
  deliveryFee,
  handoverBillLine,
  type HandoverMethod,
} from "@/features/booking/lib/handover";
import { describeBilledTime } from "@/features/rentals/lib/rent-pricing";
import { formatPhp } from "@/features/shared/lib/money";
import {
  quoteReservationFee,
  quoteTrip,
  type TripQuote,
} from "@/features/vehicles/lib/rental-pricing";
import { cn } from "@/lib/utils";

export type BookingBillInput = {
  dailyRate: number;
  start?: string | null;
  end?: string | null;
  /** Set for a with-driver trip: the owner's driver terms. */
  withDriver?: DriverTerms | null;
  pickupMethod: HandoverMethod | null;
  returnMethod: HandoverMethod | null;
  deliveryFees: DeliveryFees | null;
  bookingFees: BookingFeeLine[];
  reservationFee?: number | null;
};

type BillLine = {
  key: string;
  label: string;
  detail?: string;
  amount: number | null;
  /** Shown instead of the amount, for a price that is not in the total ("₱250 / hour"). */
  amountText?: string;
};

export type BookingBill = {
  quote: TripQuote;
  lines: BillLine[];
  /** The flat fee that holds the car, when Settings has one. */
  deposit: number | null;
};

/**
 * The online booking's bill, line by line, from what the form holds so far.
 * Null until both dates are picked. Same maths as VehicleRateQuote and
 * create_public_booking.
 */
export function bookingBill(input: BookingBillInput): BookingBill | null {
  const withDriver = input.withDriver != null;
  const pickupFee = deliveryFee(input.pickupMethod, input.deliveryFees, withDriver);
  const returnFee = deliveryFee(input.returnMethod, input.deliveryFees, withDriver);
  const quote = quoteTrip(
    { daily: input.dailyRate },
    input.start,
    input.end,
    input.withDriver ? { rate: input.withDriver.dailyRate } : null,
    pickupFee + returnFee,
    bookingFeesTotal(input.bookingFees),
  );
  if (!quote) return null;

  // Fees on every booking (the car wash) are part of the rent the renter
  // sees, not lines of their own.
  const lines: BillLine[] = [
    {
      key: "rent",
      label:
        quote.fees > 0
          ? `Car rental · ${describeBilledTime(quote.rent)}`
          : `${formatPhp(input.dailyRate)} × ${describeBilledTime(quote.rent)}`,
      detail: quote.fees > 0 ? undefined : "Car rental",
      amount: quote.rent.total + quote.fees,
    },
  ];
  if (quote.driver && input.withDriver) {
    const priced = quote.driver.rate != null;
    lines.push({
      key: "driver",
      label: driverLineLabel(quote.driver.days),
      detail: priced
        ? driverDayNote(quote.driver.rate ?? 0, input.withDriver)
        : "Fee confirmed by staff",
      amount: priced ? quote.driver.fee : null,
    });
    const extra = priced ? driverExtraHoursLine(input.withDriver) : null;
    if (extra) {
      lines.push({
        key: "driver-extra",
        label: extra.label,
        detail: extra.detail,
        amount: null,
        amountText: extra.amount,
      });
    }
  }
  for (const [leg, method, fee] of [
    ["pickup", input.pickupMethod, pickupFee],
    ["return", input.returnMethod, returnFee],
  ] as const) {
    const line = handoverBillLine(leg, method, fee, withDriver);
    // The office is free; only a delivery or collection is a bill line.
    if (!line || method === "office") continue;
    lines.push({ key: leg, label: line.label, detail: line.detail, amount: fee });
  }

  return {
    quote,
    lines,
    deposit:
      input.reservationFee && quote.total > 0
        ? quoteReservationFee(quote.total, input.reservationFee).deposit
        : null,
  };
}

/** The bill as a list: each line, the total, then the fee to hold the car. */
export function BookingBillList({
  bill,
  className,
}: {
  bill: BookingBill | null;
  className?: string;
}) {
  if (!bill) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        Pick your dates to see the total.
      </p>
    );
  }

  return (
    <dl className={cn("space-y-2 text-sm tabular-nums", className)}>
      {bill.lines.map((line) => (
        <div className="flex items-start justify-between gap-3" key={line.key}>
          <dt className="min-w-0">
            <span className="text-brand-950">{line.label}</span>
            {line.detail ? (
              <span className="block text-xs text-muted-foreground">
                {line.detail}
              </span>
            ) : null}
          </dt>
          <dd className="shrink-0 text-brand-950">
            {line.amountText ?? (line.amount == null ? "—" : formatPhp(line.amount))}
          </dd>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
        <dt className="font-semibold text-brand-950">Total</dt>
        <dd className="text-base font-bold text-brand-950">
          {formatPhp(bill.quote.total)}
        </dd>
      </div>
      {bill.deposit ? (
        <div className="flex items-baseline justify-between gap-3 text-muted-foreground">
          <dt>Reservation fee to hold the car</dt>
          <dd className="font-semibold text-brand-950">
            {formatPhp(bill.deposit)}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
