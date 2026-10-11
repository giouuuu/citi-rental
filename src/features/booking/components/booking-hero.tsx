import type { ReactNode } from "react";

/**
 * The booking page's dark band: site header, then a one-line title. Kept
 * short so the form starts on the first screen of a phone.
 */
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
      <div className="mx-auto max-w-6xl px-4 pt-3 pb-5 sm:px-6 sm:pt-4 sm:pb-6 lg:px-8">
        <h1 className="text-xl font-bold tracking-tight text-balance sm:text-2xl">
          Book the {vehicleName}
        </h1>
      </div>
    </div>
  );
}
