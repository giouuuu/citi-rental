"use client";

import { format, startOfDay } from "date-fns";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import type { DateRange } from "react-day-picker";

import { Calendar } from "@/components/ui/calendar";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import {
  expandBookedDays,
  isDayInList,
  parseDateTimeLocal,
  rangeIncludesBooked,
  toBookingRangeValues,
  type BookedDateRange,
} from "@/features/booking/lib/booking-date-range";
import { cn } from "@/lib/utils";

export type { BookedDateRange };

export function BookingDateRangeCalendar<T extends FieldValues>({
  control,
  startName,
  returnName,
  bookedRanges = [],
  disabled,
}: {
  control: Control<T>;
  startName: FieldPath<T>;
  returnName: FieldPath<T>;
  bookedRanges?: BookedDateRange[];
  disabled?: boolean;
}) {
  const bookedDays = expandBookedDays(bookedRanges);
  const today = startOfDay(new Date());

  return (
    <Controller
      control={control}
      name={startName}
      render={({ field: startField, fieldState: startState }) => (
        <Controller
          control={control}
          name={returnName}
          render={({ field: returnField, fieldState: returnState }) => {
            const from = parseDateTimeLocal(startField.value);
            const to = parseDateTimeLocal(returnField.value);
            const selected: DateRange | undefined =
              from || to
                ? { from: from ?? to, to: from && to ? to : undefined }
                : undefined;

            const invalid = startState.invalid || returnState.invalid;
            const error = startState.error ?? returnState.error;

            return (
              <Field className="gap-3" data-invalid={invalid}>
                <div>
                  <FieldLabel>Pick-up & return dates</FieldLabel>
                  <FieldDescription>
                    Select a start and end date. Greyed dates are already booked.
                  </FieldDescription>
                </div>

                <Calendar
                  className={cn(
                    "rounded-lg border",
                    invalid && "border-destructive",
                    disabled && "pointer-events-none opacity-60",
                  )}
                  defaultMonth={selected?.from ?? today}
                  disabled={[
                    { before: today },
                    (date) => isDayInList(date, bookedDays),
                  ]}
                  excludeDisabled
                  mode="range"
                  modifiers={{ booked: bookedDays }}
                  modifiersClassNames={{
                    booked:
                      "bg-muted text-muted-foreground line-through opacity-55",
                  }}
                  numberOfMonths={2}
                  onSelect={(range) => {
                    if (!range?.from) {
                      startField.onChange("");
                      returnField.onChange("");
                      return;
                    }
                    if (
                      range.to &&
                      rangeIncludesBooked(
                        { from: range.from, to: range.to },
                        bookedDays,
                      )
                    ) {
                      const partial = toBookingRangeValues(range.from);
                      startField.onChange(partial.startAt);
                      returnField.onChange("");
                      return;
                    }
                    const next = toBookingRangeValues(range.from, range.to);
                    startField.onChange(next.startAt);
                    returnField.onChange(next.expectedReturnAt);
                  }}
                  selected={selected}
                />

                <p className="text-sm text-muted-foreground">
                  {from && to ? (
                    <>
                      <span className="font-medium text-foreground">
                        {format(from, "MMM d, yyyy")}
                      </span>
                      {" → "}
                      <span className="font-medium text-foreground">
                        {format(to, "MMM d, yyyy")}
                      </span>
                    </>
                  ) : from ? (
                    <>
                      Pick-up{" "}
                      <span className="font-medium text-foreground">
                        {format(from, "MMM d, yyyy")}
                      </span>
                      {" · "}now choose a return date
                    </>
                  ) : (
                    "Select pick-up, then return."
                  )}
                </p>

                {bookedDays.length > 0 ? (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span
                      aria-hidden
                      className="inline-block size-3 rounded-sm bg-muted opacity-70"
                    />
                    Booked / unavailable
                  </p>
                ) : null}

                {invalid && error ? <FieldError errors={[error]} /> : null}
              </Field>
            );
          }}
        />
      )}
    />
  );
}
