"use client";

import dynamic from "next/dynamic";
import type { VehicleRental } from "@/features/vehicles/services/list-vehicle-rentals";

const VehicleBookingsCalendar = dynamic(
  () =>
    import("@/features/vehicles/components/vehicle-bookings-calendar").then(
      (mod) => mod.VehicleBookingsCalendar,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        Loading calendar…
      </div>
    ),
  },
);

export function VehicleBookingsTab({ rentals }: { rentals: VehicleRental[] }) {
  return <VehicleBookingsCalendar rentals={rentals} />;
}
