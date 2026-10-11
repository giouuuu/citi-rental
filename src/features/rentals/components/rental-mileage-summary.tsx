import { Gauge } from "lucide-react";

import { formatKm, kmDriven } from "@/features/rentals/lib/mileage";

/**
 * Release odometer → return odometer = km driven, above the tabs once the car
 * has been released. While it is out, the return reading waits for the
 * return inspection.
 */
export function RentalMileageSummary({
  startingOdometer,
  endingOdometer,
}: {
  startingOdometer: number | null;
  endingOdometer: number | null;
}) {
  if (startingOdometer == null) return null;
  const driven = kmDriven(startingOdometer, endingOdometer);

  return (
    <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border text-sm">
      <div className="bg-card p-3">
        <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Gauge className="size-3.5" aria-hidden />
          Release odometer
        </dt>
        <dd className="mt-1 font-semibold tabular-nums">{formatKm(startingOdometer)}</dd>
      </div>
      <div className="bg-card p-3">
        <dt className="text-xs text-muted-foreground">Return odometer</dt>
        <dd className="mt-1 font-semibold tabular-nums">
          {endingOdometer == null ? (
            <span className="font-normal text-muted-foreground">Still out</span>
          ) : (
            formatKm(endingOdometer)
          )}
        </dd>
      </div>
      <div className="bg-card p-3">
        <dt className="text-xs text-muted-foreground">Km driven</dt>
        <dd className="mt-1 text-base font-semibold tabular-nums">
          {driven == null ? (
            <span className="text-sm font-normal text-muted-foreground">At return</span>
          ) : (
            formatKm(driven)
          )}
        </dd>
      </div>
    </dl>
  );
}
