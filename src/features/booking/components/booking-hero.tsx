import type { ReactNode } from "react";

/** The booking page's dark band: site header, then which car is being booked. */
export function BookingHero({
  header,
  vehicleName,
}: {
  header: ReactNode;
  vehicleName: string;
}) {
  return (
    <div className="bg-brand-950 text-white">
      {header}
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <p className="text-xs font-semibold tracking-[0.18em] text-teal-300 uppercase">
          Customer booking
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          Reserve {vehicleName}
        </h1>
        <p className="mt-2 text-sm text-brand-100">
          Submit your trip details and we will hold the car as reserved for
          staff confirmation.
        </p>
      </div>
    </div>
  );
}
