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
  dayHolds,
  firstClash,
  wallClockDateKey,
  wallClockTime,
  type BlockedRange,
  type DayHold,
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

/** "8:30 AM" from `HH:mm`. */
function formatTime(time: string, pattern = "h:mm a") {
  const date = parse(time, "HH:mm", new Date());
  return isValid(date) ? format(date, pattern) : time;
}

/** The later of two `HH:mm` times, either possibly missing. */
function laterTime(a: string | null | undefined, b: string | null | undefined) {
  if (!a) return b ?? undefined;
  if (!b) return a;
  return a > b ? a : b;
}

/** What each day holds, keyed `YYYY-MM-DD`, for the day buttons to read. */
const BookedDaysContext = createContext<Map<string, DayHold>>(new Map());

function BookedDayButton({ children, className, day, modifiers, ...props }: DayButtonProps) {
  const booked = useContext(BookedDaysContext);
  const hold = booked.get(dateToKey(day.date));
  const holders = modifiers.booked ? (hold?.ranges ?? []) : [];
  const labels = holders.map((range) => range.label).filter(Boolean);
  // A day the car is free for part of: pickable, with when it's free.
  const partly = modifiers.partly && hold && !modifiers.outside;
  const partLabel = partly
    ? hold.freeFrom
      ? `From ${formatTime(hold.freeFrom, "h:mmaaaaa")}`
      : hold.freeUntil
        ? `Till ${formatTime(hold.freeUntil, "h:mmaaaaa")}`
        : "Part free"
    : null;
  const partTitle = partly
    ? hold.freeFrom
      ? `Free from ${formatTime(hold.freeFrom)}`
      : hold.freeUntil
        ? `Free until ${formatTime(hold.freeUntil)}`
        : "Free for part of the day"
    : undefined;

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
          : partTitle
      }
      {...props}
    >
      {children}
      {modifiers.booked && !modifiers.outside ? (
        <span className="text-[0.6rem]! leading-none font-medium opacity-100!">
          Booked
        </span>
      ) : partLabel ? (
        <span className="text-[0.55rem]! leading-none font-medium text-warning opacity-100! group-data-[selected=true]/day:text-inherit">
          {partLabel}
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
  /**
   * Times this car is taken (bookings, with any turnaround already added).
   * A day taken from midnight to midnight can't be picked; a day the car is
   * free for part of can, at those times. A trip can't run through a booking.
   */
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
 * Days another booking takes whole are hatched, labelled "Booked" and can't
 * be picked; a day the car comes back (or goes out) on stays pickable from
 * (or until) that time. A range can't run through another booking.
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
  const booked = useMemo(() => dayHolds(blocked), [blocked]);
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

  /** Earliest pick-up on a day: not gone already, and not before the car is back. */
  function pickupFloor(key: string) {
    return laterTime(
      key === earliestKey ? earliestTime : undefined,
      booked.get(key)?.freeFrom,
    );
  }

  function emit(from: string, to: string | null, times = { start: startTime, end: endTime }) {
    let pickup = times.start || DEFAULT_START_TIME;
    const floor = pickupFloor(from);
    if (floor && pickup < floor) pickup = floor;
    const nextStart = `${from}T${pickup}`;
    if (!to) {
      onChange({ start: nextStart, end: "" });
      return;
    }
    let dropOff = times.end || (to === from ? SAME_DAY_END_TIME : DEFAULT_END_TIME);
    // Back before the car's next trip goes out that day.
    const ceiling = booked.get(to)?.freeUntil;
    if (ceiling && dropOff > ceiling) dropOff = ceiling;
    onChange({ start: nextStart, end: `${to}T${dropOff}` });
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
    const ceiling = booked.get(key)?.freeUntil;
    const dropOff = endTime || (key === fromKey ? SAME_DAY_END_TIME : DEFAULT_END_TIME);
    const clash = firstClash(
      blocked,
      start,
      `${key}T${ceiling && dropOff > ceiling ? ceiling : dropOff}`,
    );
    if (clash) {
      const clashDay = wallClockDateKey(clash.startAt);
      setNotice(
        `The car is taken from ${clashDay ? formatKeyTime(clashDay, wallClockTime(clash.startAt)) : "then"}, so the rental can't run through it. ${formatKey(key, "MMM d")} is now the ${startLabel.toLowerCase()} day — choose a ${endLabel.toLowerCase()} day.`,
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
  // Times typed after the days were picked can still run into a booking.
  const timeClash = start && end ? firstClash(blocked, start, end) : null;
  const startHold = fromKey ? booked.get(fromKey) : undefined;
  const endHold = toKey ? booked.get(toKey) : undefined;

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
                    (date: Date) => Boolean(booked.get(dateToKey(date))?.full),
                  ]
            }
            mode="range"
            modifiers={{
              booked: (date: Date) => Boolean(booked.get(dateToKey(date))?.full),
              partly: (date: Date) => {
                const hold = booked.get(dateToKey(date));
                return Boolean(hold && !hold.full);
              },
            }}
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
          <span aria-hidden="true" className="text-[0.6rem] font-medium text-warning">
            From 8:30a
          </span>
          Free from (or until) that time
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
              min: fromKey ? pickupFloor(fromKey) : undefined,
              // The car goes out later that day (and isn't back first).
              max: startHold && !startHold.freeFrom ? startHold.freeUntil ?? undefined : undefined,
              onTime: (time: string) =>
                fromKey && emit(fromKey, toKey, { start: time, end: endTime }),
            },
            {
              key: "end",
              name: endLabel,
              dateKey: toKey,
              time: endTime,
              min: undefined,
              max: endHold?.freeUntil ?? undefined,
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
              max={side.max}
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
        ) : timeClash ? (
          <span className="text-warning">
            {`The car is taken ${formatKeyTime(
              wallClockDateKey(timeClash.startAt) ?? "",
              wallClockTime(timeClash.startAt),
            )} – ${formatKeyTime(
              wallClockDateKey(timeClash.endAt) ?? "",
              wallClockTime(timeClash.endAt),
            )}. Choose times outside it, or other days.`}
          </span>
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
          <p className="text-xs font-semibold text-foreground">Car not available</p>
          <ul className="mt-1 space-y-0.5 text-xs text-foreground">
            {upcoming.slice(0, LISTED_BOOKINGS).map((range) => {
              const from = wallClockDateKey(range.startAt);
              const to = wallClockDateKey(range.endAt);
              return (
                <li key={`${range.startAt}-${range.endAt}-${range.label ?? ""}`}>
                  {from ? formatKeyTime(from, wallClockTime(range.startAt)) : "?"} →{" "}
                  {to ? formatKeyTime(to, wallClockTime(range.endAt), "MMM d, yyyy") : "?"}
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
