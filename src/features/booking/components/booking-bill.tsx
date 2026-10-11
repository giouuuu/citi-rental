import {
  type BookingFeeLine,
  bookingFeesTotal,
} from "@/features/booking/lib/booking-fees";
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
  /** Set for a with-driver trip: the owner's driver day rate, if any. */
  withDriver?: { rate: number | null } | null;
  pickupMethod: HandoverMethod | null;
  returnMethod: HandoverMethod | null;
  deliveryFees: DeliveryFees | null;
  bookingFees: BookingFeeLine[];
  reservationFee?: number | null;
};

type BillLine = { key: string; label: string; detail?: string; amount: number | null };

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
  const pickupFee = deliveryFee(input.pickupMethod, input.deliveryFees);
  const returnFee = deliveryFee(input.returnMethod, input.deliveryFees);
  const quote = quoteTrip(
    { daily: input.dailyRate },
    input.start,
    input.end,
    input.withDriver,
    pickupFee + returnFee,
    bookingFeesTotal(input.bookingFees),
  );
  if (!quote) return null;

  const lines: BillLine[] = [
    {
      key: "rent",
      label: `${formatPhp(input.dailyRate)} × ${describeBilledTime(quote.rent)}`,
      detail: "Car rental",
      amount: quote.rent.total,
    },
  ];
  if (quote.driver) {
    lines.push({
      key: "driver",
      label:
        quote.driver.rate != null
          ? `Driver · ${formatPhp(quote.driver.rate)} × ${quote.driver.days} ${quote.driver.days === 1 ? "day" : "days"}`
          : "Driver",
      detail: quote.driver.rate != null ? undefined : "Fee confirmed by staff",
      amount: quote.driver.rate != null ? quote.driver.fee : null,
    });
  }
  for (const [leg, method, fee] of [
    ["pickup", input.pickupMethod, pickupFee],
    ["return", input.returnMethod, returnFee],
  ] as const) {
    const line = handoverBillLine(leg, method, fee);
    // The office is free; only a delivery or collection is a bill line.
    if (!line || method === "office") continue;
    lines.push({ key: leg, label: line.label, detail: line.detail, amount: fee });
  }
  for (const fee of input.bookingFees) {
    lines.push({ key: `fee-${fee.name}`, label: fee.name, amount: fee.amount });
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
            {line.amount == null ? "—" : formatPhp(line.amount)}
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
