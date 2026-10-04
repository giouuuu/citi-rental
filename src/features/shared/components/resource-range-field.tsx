"use client";

import { Controller, type Control, type FieldValues } from "react-hook-form";

import { BookingRangeCalendar } from "@/features/shared/components/booking-range-calendar";
import type { BlockedRange } from "@/features/shared/lib/booked-days";
import type { ResourceField } from "@/features/shared/types/resource";

const NO_BOOKINGS: BlockedRange[] = [];

/**
 * A `date-range` field: one calendar writing two form values, with the
 * bookings of whatever its `blockedBy` field currently points at blocked out.
 */
export function ResourceRangeField({
  control,
  definitionKey,
  fieldDef,
  blockedByKey,
  blocked,
  readOnly,
  isPending,
}: {
  control: Control<FieldValues>;
  definitionKey: string;
  fieldDef: ResourceField & { range: NonNullable<ResourceField["range"]> };
  /** Current value of `range.blockedBy.field`, e.g. the chosen vehicle id. */
  blockedByKey: string;
  /** Bookings for every possible `blockedByKey`. */
  blocked?: Record<string, BlockedRange[]>;
  readOnly: boolean;
  isPending: boolean;
}) {
  const { range } = fieldDef;
  const waitingForKey = Boolean(range.blockedBy) && !blockedByKey;

  return (
    <div className={fieldDef.className}>
      <Controller
        control={control}
        name={fieldDef.name}
        render={({ field: startField, fieldState: startState }) => (
          <Controller
            control={control}
            name={range.endField}
            render={({ field: endField, fieldState: endState }) => (
              <BookingRangeCalendar
                blocked={(blockedByKey && blocked?.[blockedByKey]) || NO_BOOKINGS}
                description={fieldDef.description}
                disabled={readOnly || isPending}
                emptyHint={
                  waitingForKey
                    ? "Choose a vehicle above to see the days it is already booked."
                    : undefined
                }
                end={String(endField.value ?? "")}
                endLabel={range.endLabel}
                errors={[startState.error, endState.error]}
                id={`${definitionKey}-${fieldDef.name}`}
                label={fieldDef.label}
                onChange={(next) => {
                  startField.onChange(next.start);
                  endField.onChange(next.end);
                }}
                required={fieldDef.required}
                start={String(startField.value ?? "")}
                startLabel={range.startLabel}
              />
            )}
          />
        )}
      />
    </div>
  );
}
