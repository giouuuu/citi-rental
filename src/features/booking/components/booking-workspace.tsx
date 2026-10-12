"use client";

import {
  type ComponentProps,
  type ReactNode,
  useState,
  useTransition,
} from "react";

import { getVehicleBookedRangesAction } from "@/features/booking/actions/booking-car-options-action";
import { BookingCarShowcase } from "@/features/booking/components/booking-car-showcase";
import { BookingDateClashNotice } from "@/features/booking/components/booking-date-clash-notice";
import { BookingFlow } from "@/features/booking/components/booking-flow";
import { BookingHero } from "@/features/booking/components/booking-hero";
import {
  type BookingContinueQuery,
  vehiclePageKey,
} from "@/features/booking/lib/booking-continue";
import type { PublicVehicleBookedRange } from "@/features/booking/services/list-public-vehicle-booked-ranges";
import {
  firstClash,
  wallClockDateKey,
} from "@/features/shared/lib/booked-days";
import { trackSiteEvent } from "@/features/site-analytics/lib/track-site-event";
import type { PublicListedVehicle } from "@/features/vehicles/types/public-fleet-vehicle";

type BookingWorkspaceProps = Omit<
  ComponentProps<typeof BookingFlow>,
  | "vehicle"
  | "bookedRanges"
  | "bookedRangesLoading"
  | "onDatesChange"
  | "carBar"
  | "tripNotice"
  | "datesTaken"
> & {
  /** The site header, rendered on the server. */
  header: ReactNode;
  vehicle: PublicListedVehicle;
  bookedRanges: PublicVehicleBookedRange[];
  /** Every bookable car, for the switcher. */
  fleet: PublicListedVehicle[];
  /** The trip from the URL; seeds the dates checked against the car. */
  query: BookingContinueQuery;
};

/**
 * The booking page around the form: the car row (photos, switching cars)
 * and a way out when the car is taken on the chosen dates, both handed to
 * the form so they sit inside its layout.
 * Switching happens in place, so typed details survive;
 * the address bar follows along for refreshes and shares.
 */
export function BookingWorkspace({
  header,
  vehicle: initialVehicle,
  bookedRanges: initialRanges,
  fleet: listedFleet,
  query,
  ...flowProps
}: BookingWorkspaceProps) {
  const [vehicle, setVehicle] = useState(initialVehicle);
  const [rangesByCar, setRangesByCar] = useState<
    Record<string, PublicVehicleBookedRange[]>
  >({ [initialVehicle.id]: initialRanges });
  const [loadingRanges, startLoadingRanges] = useTransition();
  const [dates, setDates] = useState({
    start: query.start ?? "",
    end: query.end ?? "",
  });

  // A car missing from the listing (say, one still without its full gallery)
  // keeps its place at the front.
  const fleet = listedFleet.some((car) => car.id === initialVehicle.id)
    ? listedFleet
    : [initialVehicle, ...listedFleet];
  const bookedRanges = rangesByCar[vehicle.id];

  function selectVehicle(next: PublicListedVehicle) {
    if (next.id === vehicle.id) return;
    setVehicle(next);
    trackSiteEvent("vehicle_view", { vehicleId: next.id });
    window.history.replaceState(
      null,
      "",
      `/book/${vehiclePageKey(next)}${window.location.search}`,
    );
    if (rangesByCar[next.id]) return;
    startLoadingRanges(async () => {
      const ranges = await getVehicleBookedRangesAction(next.id);
      setRangesByCar((current) => ({ ...current, [next.id]: ranges }));
    });
  }

  const fromKey = wallClockDateKey(dates.start);
  const toKey = wallClockDateKey(dates.end) ?? fromKey;
  // Times, not whole days: a car back at 7:00 AM is free that afternoon.
  const clash =
    bookedRanges && dates.start && dates.end
      ? firstClash(blocked(bookedRanges), dates.start, dates.end)
      : null;
  const clashStart = clash ? wallClockDateKey(clash.startAt) : null;
  const clashDay =
    clash && fromKey ? (clashStart && clashStart > fromKey ? clashStart : fromKey) : null;

  return (
    <>
      <BookingHero header={header} vehicleName={vehicle.name} />

      <div className="mx-auto max-w-6xl px-4 pt-5 pb-10 sm:px-6 lg:px-8">
        <BookingFlow
          {...flowProps}
          bookedRanges={bookedRanges ?? []}
          bookedRangesLoading={loadingRanges || !bookedRanges}
          carBar={
            <BookingCarShowcase
              fleet={fleet}
              onSelect={selectVehicle}
              vehicle={vehicle}
            />
          }
          datesTaken={Boolean(clashDay)}
          onDatesChange={setDates}
          tripNotice={
            clashDay && fromKey && toKey ? (
              <BookingDateClashNotice
                clashDay={clashDay}
                from={fromKey}
                key={vehicle.id}
                onChoose={selectVehicle}
                to={toKey}
                vehicleId={vehicle.id}
                vehicleName={vehicle.name}
              />
            ) : null
          }
          vehicle={vehicle}
        />
      </div>
    </>
  );
}

function blocked(ranges: PublicVehicleBookedRange[]) {
  return ranges.map((range) => ({
    startAt: range.startAt,
    endAt: range.expectedReturnAt,
  }));
}
