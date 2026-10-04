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
import { Input } from "@/components/ui/input";
import {
  bookedDays,
  firstBookedDayBetween,
  wallClockDateKey,
  wallClockTime,
  type BlockedRange,
} from "@/features/shared/lib/booked-days";
import { daysBetweenKeys } from "@/features/shared/lib/manila-time";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export type { BlockedRange };

const DEFAULT_START_TIME = "09:00";
const DEFAULT_END_TIME = "09:00";
/** A same-day rental still has to end after it starts. */
const SAME_DAY_END_TIME = "18:00";
/** How many upcoming bookings to spell out under the calendar. */
const LISTED_BOOKINGS = 6;

const HATCH =
  "[background-image:repeating-linear-gradient(135deg,transparent_0_5px,color-mix(in_oklab,var(--warning)_18%,transparent)_5px_10px)]";

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
            "cursor-not-allowed bg-warning-surface text-warning disabled:pointer-events-auto disabled:opacity-100",
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
        <span className="text-[0.6rem]! leading-none font-semibold opacity-100!">
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
  /** Earliest pickable day as `YYYY-MM-DD` (customers can't book the past). */
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
  const todayKey = dateToKey(new Date());
  const [month, setMonth] = useState<Date | undefined>(
    () => keyToDate(fromKey) ?? keyToDate(minDate) ?? new Date(),
  );

  const visibleErrors = errors.filter((error) => error?.message);
  const invalid = visibleErrors.length > 0;

  function emit(from: string, to: string | null, times = { start: startTime, end: endTime }) {
    const nextStart = `${from}T${times.start || DEFAULT_START_TIME}`;
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

  const days = fromKey && toKey ? daysBetweenKeys(fromKey, toKey) : null;

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
            components={{ DayButton: BookedDayButton }}
            disabled={
              disabled
                ? true
                : [
                    ...(minDate && keyToDate(minDate) ? [{ before: keyToDate(minDate)! }] : []),
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
            className={cn("size-3.5 rounded-sm bg-warning-surface ring-1 ring-warning/40", HATCH)}
          />
          <span>
            <span className="font-medium text-warning">Booked</span>
            {" — not available"}
          </span>
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-3.5 rounded-sm bg-primary" />
          Your dates
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-3.5 rounded-sm bg-muted ring-1 ring-border" />
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
              onTime: (time: string) =>
                fromKey && emit(fromKey, toKey, { start: time, end: endTime }),
            },
            {
              key: "end",
              name: endLabel,
              dateKey: toKey,
              time: endTime,
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
            <Input
              aria-label={`${side.name} time`}
              className="w-28 shrink-0 appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
              disabled={disabled || !side.dateKey}
              id={`${id}-${side.key}-time`}
              onChange={(event) => side.onTime(event.target.value)}
              step={60}
              type="time"
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
              {days} {days === 1 ? "day" : "days"}
            </span>
            {" · "}
            {formatKey(fromKey!, "MMM d")} → {formatKey(toKey!, "MMM d, yyyy")}
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
        <div className="rounded-lg border border-warning/30 bg-warning-surface/60 px-3 py-2">
          <p className="text-xs font-semibold text-warning">Already booked</p>
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
