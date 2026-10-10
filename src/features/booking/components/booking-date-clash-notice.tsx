"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { CalendarX2, CarFront, Search } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { listCarsFreeForDatesAction } from "@/features/booking/actions/booking-car-options-action";
import { formatDateKey } from "@/features/shared/lib/manila-time";
import { formatPhp } from "@/features/shared/lib/money";
import type { PublicListedVehicle } from "@/features/vehicles/types/public-fleet-vehicle";

/** "Oct 12" or "Oct 12 – Oct 14". */
function formatDays(from: string, to: string) {
  return from === to
    ? formatDateKey(from, "day")
    : `${formatDateKey(from, "day")} – ${formatDateKey(to, "day")}`;
}

/**
 * Shown while the chosen car is booked on part of the chosen trip. Offers the
 * cars that are free for the whole trip; picking one switches the booking to
 * it and keeps the dates.
 */
export function BookingDateClashNotice({
  vehicleId,
  vehicleName,
  clashDay,
  from,
  to,
  onChoose,
}: {
  vehicleId: string;
  vehicleName: string;
  /** First day of the trip this car is already booked. */
  clashDay: string;
  /** The trip, as `YYYY-MM-DD` day keys. */
  from: string;
  to: string;
  onChoose: (vehicle: PublicListedVehicle) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cars, setCars] = useState<PublicListedVehicle[]>();
  const [loading, startLoading] = useTransition();
  const days = formatDays(from, to);

  function show() {
    setOpen(true);
    setCars(undefined);
    startLoading(async () => {
      const free = await listCarsFreeForDatesAction(from, to);
      setCars(free.filter((car) => car.id !== vehicleId));
    });
  }

  return (
    <>
      <Alert className="border-warning/30 bg-warning-surface">
        <CalendarX2 className="text-warning" />
        <AlertTitle className="text-warning">
          {vehicleName} is booked on {formatDateKey(clashDay, "day")}
        </AlertTitle>
        <AlertDescription>
          <p>
            Pick other dates on the calendar, or switch to a car that is free
            for {days}.
          </p>
          <Button className="mt-2" onClick={show} size="sm" type="button">
            <Search />
            Show cars free on {days}
          </Button>
        </AlertDescription>
      </Alert>

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_auto_minmax(0,1fr)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cars free on {days}</DialogTitle>
            <DialogDescription>
              Choose one to book it instead. Your dates and details stay.
            </DialogDescription>
          </DialogHeader>

          {/* Reserved slot, so the list does not jump when loading ends. */}
          <div aria-hidden="true" className="h-1">
            {loading ? <Progress value={null} /> : null}
          </div>

          <div className="-mx-4 overflow-y-auto px-4">
            {cars === undefined ? null : cars.length ? (
              <ul aria-live="polite" className="flex flex-col gap-2">
                {cars.map((car) => (
                  <li key={car.id}>
                    <FreeCar
                      car={car}
                      onChoose={() => {
                        onChoose(car);
                        setOpen(false);
                      }}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CarFront />
                  </EmptyMedia>
                  <EmptyTitle>No other car is free on {days}</EmptyTitle>
                  <EmptyDescription>
                    Try other dates on the calendar, or message us and we will
                    help you find a car.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FreeCar({
  car,
  onChoose,
}: {
  car: PublicListedVehicle;
  onChoose: () => void;
}) {
  const cover = car.photo_url ?? car.gallery[0]?.url;
  const specs = [
    car.category?.trim(),
    car.seating_capacity ? `${car.seating_capacity} seats` : null,
    car.transmission === "manual"
      ? "Manual"
      : car.transmission
        ? "Automatic"
        : null,
  ].filter(Boolean);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-2">
      <span className="relative aspect-[4/3] w-24 shrink-0 overflow-hidden rounded-md bg-brand-50">
        {cover ? (
          <Image alt="" className="object-cover" fill sizes="96px" src={cover} />
        ) : (
          <CarFront
            aria-hidden="true"
            className="absolute inset-0 m-auto size-7 text-brand-300"
          />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-brand-950">{car.name}</p>
        {specs.length ? (
          <p className="truncate text-xs text-muted-foreground">
            {specs.join(" · ")}
          </p>
        ) : null}
        <p className="text-sm text-brand-950 tabular-nums">
          {formatPhp(car.daily_rate)}
          <span className="text-xs text-muted-foreground">/day</span>
        </p>
      </div>
      <Button onClick={onChoose} size="sm" type="button" variant="outline">
        Choose
      </Button>
    </div>
  );
}
