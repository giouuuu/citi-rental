"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import type { PublicVehicleBookedRange } from "@/features/booking/services/list-public-vehicle-booked-ranges";
import { BookingRangeCalendar } from "@/features/shared/components/booking-range-calendar";

export function BookingDateRangeCalendar<T extends FieldValues, TOut extends FieldValues = T>({
  control,
  startName,
  returnName,
  bookedRanges = [],
  disabled,
}: {
  control: Control<T, unknown, TOut>;
  startName: FieldPath<T>;
  returnName: FieldPath<T>;
  bookedRanges?: PublicVehicleBookedRange[];
  disabled?: boolean;
}) {
  // Customers see that a day is taken, never who took it.
  const blocked = useMemo(
    () =>
      bookedRanges.map((range) => ({
        startAt: range.startAt,
        endAt: range.expectedReturnAt,
      })),
    [bookedRanges],
  );
  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <Controller
      control={control}
      name={startName}
      render={({ field: startField, fieldState: startState }) => (
        <Controller
          control={control}
          name={returnName}
          render={({ field: returnField, fieldState: returnState }) => (
            <BookingRangeCalendar
              blocked={blocked}
              description="Tap your pick-up day, then your return day. Hatched days are already booked for this car."
              disabled={disabled}
              end={String(returnField.value ?? "")}
              errors={[startState.error, returnState.error]}
              id="booking-dates"
              label="Pick-up & return dates"
              minDate={today}
              onChange={(next) => {
                startField.onChange(next.start);
                returnField.onChange(next.end);
              }}
              required
              start={String(startField.value ?? "")}
            />
          )}
        />
      )}
    />
  );
}
