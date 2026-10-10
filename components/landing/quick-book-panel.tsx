"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, MapPin } from "lucide-react";

import { BookingDatePicker } from "@/components/landing/booking-date-picker";
import { todayDateValue } from "@/components/landing/booking-search-schema";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { DrivingModeToggle } from "@/features/booking/components/driving-mode-toggle";
import { bookingFormPath } from "@/features/booking/lib/booking-continue";
import {
  parseDrivingMode,
  type DrivingMode,
} from "@/features/booking/lib/driving-mode";
import { VehicleRateQuote } from "@/features/vehicles/components/vehicle-rate-quote";
import type { PublicListedVehicle } from "@/features/vehicles/types/public-fleet-vehicle";

export type QuickBookTrip = {
  pickup?: string;
  start?: string;
  end?: string;
  mode?: string;
};

/**
 * Book from the car's own dialog: driving option, delivery spot and dates,
 * with the live trip total. Every choice rides along to the booking form, so
 * nothing is typed twice. Nothing is required here; the form asks for what
 * is still missing.
 */
export function QuickBookPanel({
  vehicle,
  trip,
  reservationFee,
  driverDailyRate,
  onBook,
}: {
  vehicle: PublicListedVehicle;
  trip: QuickBookTrip;
  reservationFee?: number | null;
  driverDailyRate?: number | null;
  /** Close the dialog: the booking step opens as its own modal. */
  onBook: () => void;
}) {
  const today = todayDateValue();
  const [mode, setMode] = useState<DrivingMode>(parseDrivingMode(trip.mode));
  const [pickup, setPickup] = useState(trip.pickup ?? "");
  const [start, setStart] = useState(
    trip.start && trip.start >= today ? trip.start : "",
  );
  const [end, setEnd] = useState(
    trip.end && trip.end >= (trip.start || today) ? trip.end : "",
  );
  const withDriver = mode === "with-driver";
  const seats = vehicle.seating_capacity;

  const href = bookingFormPath(vehicle.id, {
    pickup: pickup.trim() || undefined,
    start: start || undefined,
    end: end || undefined,
    mode,
  });

  return (
    <div className="flex flex-col gap-4">
      <DrivingModeToggle
        driverDailyRate={driverDailyRate}
        onChange={setMode}
        value={mode}
      />

      <Field className="gap-1.5">
        <FieldLabel htmlFor={`quick-pickup-${vehicle.id}`}>
          Deliver to
        </FieldLabel>
        <InputGroup>
          <InputGroupAddon>
            <MapPin aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            autoComplete="off"
            id={`quick-pickup-${vehicle.id}`}
            onChange={(event) => setPickup(event.target.value)}
            placeholder="Airport, hotel, or address"
            value={pickup}
          />
        </InputGroup>
      </Field>

      <div className="grid grid-cols-2 items-start gap-3">
        <Field className="gap-1.5">
          <FieldLabel htmlFor={`quick-start-${vehicle.id}`}>Pick-up</FieldLabel>
          <BookingDatePicker
            id={`quick-start-${vehicle.id}`}
            minDate={today}
            onChange={(value) => {
              setStart(value);
              if (end && value && end < value) setEnd("");
            }}
            placeholder="Add date"
            value={start}
          />
        </Field>
        <Field className="gap-1.5">
          <FieldLabel htmlFor={`quick-end-${vehicle.id}`}>Return</FieldLabel>
          <BookingDatePicker
            id={`quick-end-${vehicle.id}`}
            minDate={start || today}
            onChange={setEnd}
            placeholder="Add date"
            value={end}
          />
        </Field>
      </div>

      <div className="rounded-xl bg-brand-50/70 px-3.5 py-3">
        <VehicleRateQuote
          end={end}
          rates={{
            daily: vehicle.daily_rate,
            halfDay: vehicle.half_day_rate,
            hourly: vehicle.hourly_rate,
          }}
          reservationFee={reservationFee}
          start={start}
          withDriver={withDriver ? { rate: driverDailyRate ?? null } : null}
        />
        {!start || !end ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Add your dates to see the trip total.
          </p>
        ) : null}
        {seats ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Seats {withDriver ? seats - 1 : seats} passengers
            {withDriver ? " plus the driver" : ""}.
          </p>
        ) : null}
      </div>

      {/* Pinned to the bottom of the sheet on phones, so it is always one tap away. */}
      <div className="sticky bottom-0 -mx-2 bg-popover px-2 pt-1 pb-1 md:static md:mx-0 md:p-0">
        <Button asChild className="h-12 w-full rounded-xl" size="lg">
          <Link href={href} onClick={onBook}>
            Book this car
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
