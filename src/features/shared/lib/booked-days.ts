import { addDaysToKey, daysBetweenKeys, parseDateKey } from "@/features/shared/lib/manila-time";

/** An existing booking that blocks a car's calendar. */
export type BlockedRange = {
  /** ISO timestamp or `YYYY-MM-DDTHH:mm`. */
  startAt: string;
  endAt: string;
  /** Who holds it, e.g. "RNT-260715-001 · Reserved". Staff screens only — omit on public pages. */
  label?: string;
};

/** What a calendar day holds for one car. */
export type DayHold = {
  /** Bookings that touch the day. */
  ranges: BlockedRange[];
  /** Taken from midnight to midnight: the day can't be picked. */
  full: boolean;
  /** The car is back from this `HH:mm` and free until midnight (it returns that day). */
  freeFrom: string | null;
  /** The car is free from midnight until this `HH:mm` (it goes out that day). */
  freeUntil: string | null;
};

/** Longest stretch one booking may paint, so a bad row can't spin the loop. */
const MAX_BLOCKED_DAYS = 400;
const DAY_MINUTES = 24 * 60;

/**
 * The calendar day of a stored or typed timestamp, read as written — the same
 * digits `DateTimePicker` shows for it, so the calendar and the form agree.
 */
export function wallClockDateKey(value: string | null | undefined): string | null {
  return value ? parseDateKey(value.slice(0, 10)) : null;
}

/** The `HH:mm` of a stored or typed timestamp, read as written; "" when absent. */
export function wallClockTime(value: string | null | undefined): string {
  return value?.match(/T(\d{2}:\d{2})/)?.[1] ?? "";
}

/** `YYYY-MM-DDTHH:mm`, comparable as text; null when unreadable. */
function wallClock(value: string | null | undefined): string | null {
  const day = wallClockDateKey(value);
  if (!day) return null;
  return `${day}T${wallClockTime(value) || "00:00"}`;
}

function minutesOf(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function timeOf(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * Every day a booking touches, and how much of it. A car coming back at 7:00
 * AM is free from 7:00 that day, and one going out at 10:00 AM is free until
 * then, so those days stay pickable at those times; only a day taken from
 * midnight to midnight is full. Same rule as the database, which only
 * refuses overlapping times.
 */
export function dayHolds(ranges: BlockedRange[]): Map<string, DayHold> {
  const busy = new Map<string, { ranges: BlockedRange[]; spans: [number, number][] }>();
  for (const range of ranges) {
    const from = wallClockDateKey(range.startAt);
    const to = wallClockDateKey(range.endAt);
    if (!from || !to || to < from) continue;
    const startMinute = minutesOf(wallClockTime(range.startAt) || "00:00");
    const endMinute = minutesOf(wallClockTime(range.endAt) || "00:00");
    const span = Math.min(daysBetweenKeys(from, to), MAX_BLOCKED_DAYS);
    for (let offset = 0; offset < span; offset += 1) {
      const key = addDaysToKey(from, offset);
      const dayStart = key === from ? startMinute : 0;
      const dayEnd = key === to ? endMinute : DAY_MINUTES;
      // Back at midnight sharp: the day itself is untouched.
      if (dayEnd <= dayStart) continue;
      const entry = busy.get(key) ?? { ranges: [], spans: [] };
      entry.ranges.push(range);
      entry.spans.push([dayStart, dayEnd]);
      busy.set(key, entry);
    }
  }

  const holds = new Map<string, DayHold>();
  for (const [key, { ranges: dayRanges, spans }] of busy) {
    const merged: [number, number][] = [];
    for (const [start, end] of spans.toSorted((a, b) => a[0] - b[0])) {
      const last = merged.at(-1);
      if (last && start <= last[1]) last[1] = Math.max(last[1], end);
      else merged.push([start, end]);
    }
    const first = merged[0];
    const last = merged.at(-1)!;
    const full = merged.length === 1 && first[0] === 0 && first[1] >= DAY_MINUTES;
    holds.set(key, {
      ranges: dayRanges,
      full,
      freeFrom: !full && last[1] < DAY_MINUTES ? timeOf(last[1]) : null,
      freeUntil: !full && first[0] > 0 ? timeOf(first[0]) : null,
    });
  }
  return holds;
}

/**
 * The first booking a trip from `start` to `end` (wall-clock) runs into;
 * null when the car is free the whole time. Back-to-back is fine: a trip may
 * start the minute the car comes back.
 */
export function firstClash(
  ranges: BlockedRange[],
  start: string,
  end: string,
): BlockedRange | null {
  const from = wallClock(start);
  const to = wallClock(end);
  if (!from || !to || to <= from) return null;
  return (
    ranges
      .filter((range) => {
        const rangeStart = wallClock(range.startAt);
        const rangeEnd = wallClock(range.endAt);
        return rangeStart && rangeEnd && rangeStart < to && from < rangeEnd;
      })
      .toSorted((a, b) => a.startAt.localeCompare(b.startAt))[0] ?? null
  );
}
