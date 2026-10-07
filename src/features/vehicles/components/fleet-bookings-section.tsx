"use client";

import dynamic from "next/dynamic";

import type { FleetCar } from "@/features/vehicles/components/fleet-bookings-calendar";

// FullCalendar measures the DOM, so it renders in the browser only.
const FleetBookingsCalendar = dynamic(
  () =>
    import("@/features/vehicles/components/fleet-bookings-calendar").then(
      (mod) => mod.FleetBookingsCalendar,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-[32rem] rounded-lg border border-dashed" aria-hidden="true" />
    ),
  },
);

/** The consolidated booking calendar under the Vehicles list. */
export function FleetBookingsSection({ cars }: { cars: FleetCar[] }) {
  return (
    <section aria-labelledby="fleet-bookings-title" className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold text-brand-950" id="fleet-bookings-title">
          Fleet bookings
        </h2>
        <p className="text-sm text-muted-foreground">
          Every car&apos;s bookings in one calendar. Click a booking to open the rental.
        </p>
      </div>
      <FleetBookingsCalendar cars={cars} />
    </section>
  );
}
