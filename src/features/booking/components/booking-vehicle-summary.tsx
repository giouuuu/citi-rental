import { CarFront } from "lucide-react";

import { VehicleRateQuote } from "@/features/vehicles/components/vehicle-rate-quote";
import type { PublicFleetVehicle } from "@/features/vehicles/types/public-fleet-vehicle";

type BookingVehicleSummaryProps = {
  vehicle: PublicFleetVehicle;
  startAt?: string | null;
  expectedReturnAt?: string | null;
};

export function BookingVehicleSummary({
  vehicle,
  startAt,
  expectedReturnAt,
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
            dailyRate={vehicle.daily_rate}
            end={expectedReturnAt}
            start={startAt}
          />
        </div>
      </div>
    </div>
  );
}
