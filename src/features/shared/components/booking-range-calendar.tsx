"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { format, isValid, parse } from "date-fns";
import type { DayButtonProps } from "react-day-picker";

import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { TimePicker } from "@/components/ui/time-picker";
import {
  bookedDays,
  firstBookedDayBetween,
  wallClockDateKey,
  wallClockTime,
  type BlockedRange,
} from "@/features/shared/lib/booked-days";
import { formatDuration } from "@/features/shared/lib/format-duration";
import {
  daysBetweenKeys,
  earliestManilaDateTimeInput,
  manilaDateKey,
  parseManilaDateTimeInput,
} from "@/features/shared/lib/manila-time";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export type { BlockedRange };

const DEFAULT_START_TIME = "09:00";
const DEFAULT_END_TIME = "09:00";
/** A same-day rental still has to end after it starts. */
const SAME_DAY_END_TIME = "18:00";
/** How many upcoming bookings to spell out under the calendar. */
const LISTED_BOOKINGS = 6;

// Taken days read as unavailable, not as an alert: a quiet grey hatch, so the
// free days and the teal selection carry the calendar.
const HATCH =
  "[background-image:repeating-linear-gradient(135deg,transparent_0_5px,color-mix(in_oklab,var(--muted-foreground)_14%,transparent)_5px_10px)]";

function keyToDate(key: string | null | undefined) {
  if (!key) return undefined;
  const date = parse(key, "yyyy-MM-dd", new Date());
  return isValid(date) ? date : undefined;
}

function dateToKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function formatKey(key: string, pattern = "EEE, MMM d, yyyy") {
  const date = keyToDate(key);
  return date ? format(date, pattern) : key;
}

/** "Oct 1, 9:00 AM" from a day key and an `HH:mm` time. */
function formatKeyTime(key: string, time: string, pattern = "MMM d") {
  const date = time ? parse(`${key} ${time}`, "yyyy-MM-dd HH:mm", new Date()) : undefined;
  return date && isValid(date) ? format(date, `${pattern}, h:mm a`) : formatKey(key, pattern);
}

/** Booked days, keyed `YYYY-MM-DD`, for the day buttons to read. */
const BookedDaysContext = createContext<Map<string, BlockedRange[]>>(new Map());

function BookedDayButton({ children, className, day, modifiers, ...props }: DayButtonProps) {
  const booked = useContext(BookedDaysContext);
  const holders = modifiers.booked ? (booked.get(dateToKey(day.date)) ?? []) : [];
  const labels = holders.map((range) => range.label).filter(Boolean);

  return (
    <CalendarDayButton
      className={cn(
        modifiers.booked &&
          cn(
            "cursor-not-allowed bg-muted text-muted-foreground hover:bg-muted hover:text-muted-foreground disabled:pointer-events-auto disabled:opacity-100",
            HATCH,
          ),
        className,
      )}
      day={day}
      modifiers={modifiers}
      title={
        modifiers.booked
          ? labels.length
            ? `Booked — ${labels.join(", ")}`
            : "Booked — not available this day"
          : undefined
      }
      {...props}
    >
      {children}
      {modifiers.booked && !modifiers.outside ? (
        <span className="text-[0.6rem]! leading-none font-medium opacity-100!">
          Booked
        </span>
      ) : null}
    </CalendarDayButton>
  );
}

type BookingRangeCalendarProps = {
  id: string;
  label: string;
  description?: string;
  required?: boolean;
  /** `YYYY-MM-DDTHH:mm` (or a stored ISO timestamp); "" when unset. */
  start: string;
  end: string;
  onChange: (next: { start: string; end: string }) => void;
  /** Existing bookings for this car. Their days can't be picked or crossed. */
  blocked?: BlockedRange[];
  /**
   * Earliest pickable day as `YYYY-MM-DD` (customers can't book the past).
   * Setting it also blocks pick-up times already gone today.
   */
  minDate?: string;
  startLabel?: string;
  endLabel?: string;
  /** Replaces the booked-day list, e.g. "Choose a vehicle to see its bookings". */
  emptyHint?: string;
  disabled?: boolean;
  errors?: ({ message?: string } | undefined)[];
};

/**
 * Pick-up and return on one calendar: click a start day, then an end day.
 * Days another booking holds are hatched, labelled "Booked" and can't be
 * picked — and a range can't run through them.
 */
export function BookingRangeCalendar({
  id,
  label,
  description,
  required,
  start,
  end,
  onChange,
  blocked = [],
  minDate,
  startLabel = "Pick-up",
  endLabel = "Return",
  emptyHint,
  disabled,
  errors = [],
}: BookingRangeCalendarProps) {
  const isMobile = useIsMobile();
  const booked = useMemo(() => bookedDays(blocked), [blocked]);
  const [notice, setNotice] = useState<string | null>(null);

  const fromKey = wallClockDateKey(start);
  const toKey = wallClockDateKey(end);
  const startTime = wallClockTime(start);
  const endTime = wallClockTime(end);
  const now = new Date();
  const todayKey = manilaDateKey(now);
  // Customers can't pick up in the past: not before now, on the minute step.
  const earliest = minDate ? earliestManilaDateTimeInput(now) : null;
  const earliestKey = earliest?.slice(0, 10);
  const earliestTime = earliest?.slice(11);
  // Late at night "now" rounds into tomorrow, and today has no slot left.
  const firstDay =
    minDate && earliestKey && earliestKey > minDate ? earliestKey : minDate;
  const [month, setMonth] = useState<Date | undefined>(
    () => keyToDate(fromKey) ?? keyToDate(firstDay) ?? new Date(),
  );

  const visibleErrors = errors.filter((error) => error?.message);
  const invalid = visibleErrors.length > 0;

  function emit(from: string, to: string | null, times = { start: startTime, end: endTime }) {
    let pickup = times.start || DEFAULT_START_TIME;
    if (from === earliestKey && earliestTime && pickup < earliestTime) {
      pickup = earliestTime;
    }
    const nextStart = `${from}T${pickup}`;
    if (!to) {
      onChange({ start: nextStart, end: "" });
      return;
    }
    const fallbackEnd = to === from ? SAME_DAY_END_TIME : DEFAULT_END_TIME;
    onChange({ start: nextStart, end: `${to}T${times.end || fallbackEnd}` });
  }

  function pickDay(day: Date) {
    const key = dateToKey(day);
    // Click start, then end. A third click starts over, and a click before
    // the start moves the start instead of flipping the range.
    if (!fromKey || toKey || key < fromKey) {
      setNotice(null);
      emit(key, null);
      return;
    }
    const clash = firstBookedDayBetween(fromKey, key, booked);
    if (clash) {
      setNotice(
        `${formatKey(clash, "MMM d")} is already booked, so the rental can't run through it. ${formatKey(key, "MMM d")} is now the ${startLabel.toLowerCase()} day — choose a ${endLabel.toLowerCase()} day.`,
      );
      emit(key, null);
      return;
    }
    setNotice(null);
    emit(fromKey, key);
  }

  const upcoming = blocked
    .filter((range) => (wallClockDateKey(range.endAt) ?? "") >= todayKey)
    .toSorted((a, b) => a.startAt.localeCompare(b.startAt));

  // The rent is priced on this duration, the time the car is out.
  const days = fromKey && toKey ? daysBetweenKeys(fromKey, toKey) : null;
  const startInstant = parseManilaDateTimeInput(start);
  const endInstant = parseManilaDateTimeInput(end);
  const duration =
    startInstant && endInstant ? formatDuration(startInstant, endInstant) : null;

  return (
    <Field data-invalid={invalid || undefined}>
      <div>
        <FieldLabel htmlFor={`${id}-start-time`}>
          {label}
          {required ? (
            <span aria-hidden="true" className="text-destructive">
              *
            </span>
          ) : null}
        </FieldLabel>
        {description ? <FieldDescription>{description}</FieldDescription> : null}
      </div>

      <div
        className={cn(
          "w-full overflow-x-auto rounded-lg border bg-background",
          invalid && "border-destructive",
        )}
      >
        <BookedDaysContext.Provider value={booked}>
          <Calendar
            className="mx-auto [--cell-size:--spacing(10)] sm:[--cell-size:--spacing(11)]"
            classNames={{
              // An outline, so today never looks like a taken (grey) day.
              today:
                "rounded-(--cell-radius) font-semibold text-primary ring-1 ring-primary/45 ring-inset data-[selected=true]:rounded-none data-[selected=true]:ring-0",
            }}
            components={{ DayButton: BookedDayButton }}
            disabled={
              disabled
                ? true
                : [
                    ...(firstDay && keyToDate(firstDay) ? [{ before: keyToDate(firstDay)! }] : []),
                    (date: Date) => booked.has(dateToKey(date)),
                  ]
            }
            mode="range"
            modifiers={{ booked: (date: Date) => booked.has(dateToKey(date)) }}
            modifiersClassNames={{ booked: "opacity-100!" }}
            month={month}
            numberOfMonths={isMobile ? 1 : 2}
            onMonthChange={setMonth}
            onSelect={(_, day) => pickDay(day)}
            selected={
              fromKey
                ? { from: keyToDate(fromKey), to: keyToDate(toKey) }
                : undefined
            }
          />
        </BookedDaysContext.Provider>
      </div>

      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn("size-3.5 rounded-sm bg-muted ring-1 ring-border", HATCH)}
          />
          Booked — not available
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-3.5 rounded-sm bg-primary" />
          Your dates
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-3.5 rounded-sm ring-1 ring-primary/45 ring-inset" />
          Today
        </li>
      </ul>

      <div className="grid items-start gap-3 sm:grid-cols-2">
        {(
          [
            {
              key: "start",
              name: startLabel,
              dateKey: fromKey,
              time: startTime,
              min: fromKey && fromKey === earliestKey ? earliestTime : undefined,
              onTime: (time: string) =>
                fromKey && emit(fromKey, toKey, { start: time, end: endTime }),
            },
            {
              key: "end",
              name: endLabel,
              dateKey: toKey,
              time: endTime,
              min: undefined,
              onTime: (time: string) =>
                fromKey && toKey && emit(fromKey, toKey, { start: startTime, end: time }),
            },
          ] as const
        ).map((side) => (
          <div
            className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2"
            key={side.key}
          >
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{side.name}</p>
              <p
                className={cn(
                  "truncate text-sm font-medium",
                  !side.dateKey && "text-muted-foreground",
                )}
              >
                {side.dateKey ? formatKey(side.dateKey) : "Pick a day"}
              </p>
            </div>
            <TimePicker
              aria-label={`${side.name} time`}
              className="w-34 shrink-0"
              disabled={disabled || !side.dateKey}
              id={`${id}-${side.key}-time`}
              min={side.min}
              onValueChange={side.onTime}
              placeholder="Time"
              required
              value={side.time}
            />
          </div>
        ))}
      </div>

      <p aria-live="polite" className="text-sm text-muted-foreground">
        {notice ? (
          <span className="text-warning">{notice}</span>
        ) : days ? (
          <>
            <span className="font-medium text-foreground">
              {duration ?? `${days} ${days === 1 ? "day" : "days"}`}
            </span>
            {" · "}
            {formatKeyTime(fromKey!, startTime)} → {formatKeyTime(toKey!, endTime, "MMM d, yyyy")}
          </>
        ) : fromKey ? (
          `Now choose the ${endLabel.toLowerCase()} day.`
        ) : (
          `Choose the ${startLabel.toLowerCase()} day, then the ${endLabel.toLowerCase()} day.`
        )}
      </p>

      {emptyHint ? (
        <p className="text-xs text-muted-foreground">{emptyHint}</p>
      ) : upcoming.length > 0 ? (
        <div className="rounded-lg border bg-muted/40 px-3 py-2">
          <p className="text-xs font-semibold text-foreground">Already booked</p>
          <ul className="mt-1 space-y-0.5 text-xs text-foreground">
            {upcoming.slice(0, LISTED_BOOKINGS).map((range) => {
              const from = wallClockDateKey(range.startAt);
              const to = wallClockDateKey(range.endAt);
              return (
                <li key={`${range.startAt}-${range.endAt}-${range.label ?? ""}`}>
                  {from ? formatKey(from, "MMM d") : "?"} → {to ? formatKey(to, "MMM d, yyyy") : "?"}
                  {range.label ? (
                    <span className="text-muted-foreground"> · {range.label}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {upcoming.length > LISTED_BOOKINGS ? (
            <p className="mt-1 text-xs text-muted-foreground">
              +{upcoming.length - LISTED_BOOKINGS} more — hover a booked day for details.
            </p>
          ) : null}
        </div>
      ) : null}

      {invalid ? <FieldError errors={visibleErrors} /> : null}
    </Field>
  );
}
