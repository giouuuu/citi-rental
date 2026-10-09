import { CarFront } from "lucide-react";

import { VehicleRateQuote } from "@/features/vehicles/components/vehicle-rate-quote";
import type { PublicFleetVehicle } from "@/features/vehicles/types/public-fleet-vehicle";

type BookingVehicleSummaryProps = {
  vehicle: PublicFleetVehicle;
  startAt?: string | null;
  expectedReturnAt?: string | null;
  reservationFee?: number | null;
  freeCancellationHours?: number | null;
};

export function BookingVehicleSummary({
  vehicle,
  startAt,
  expectedReturnAt,
  reservationFee,
  freeCancellationHours,
}: BookingVehicleSummaryProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
          <CarFront className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wider text-teal-700 uppercase">
            {vehicle.category?.trim() || "Fleet"}
          </p>
          <h2 className="text-lg font-bold text-brand-950">{vehicle.name}</h2>
          <p className="text-sm text-muted-foreground">
            {vehicle.make} {vehicle.model} · {vehicle.year}
          </p>
          <VehicleRateQuote
            className="mt-3"
            rates={{
              daily: vehicle.daily_rate,
              halfDay: vehicle.half_day_rate,
              hourly: vehicle.hourly_rate,
            }}
            end={expectedReturnAt}
            reservationFee={reservationFee}
            start={startAt}
          />
          {reservationFee && freeCancellationHours != null ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {freeCancellationHours > 0
                ? `Free cancellation up to ${freeCancellationHours} hours before pickup. Cancel later and the reservation fee is not refunded.`
                : "The reservation fee is not refunded if you cancel."}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
