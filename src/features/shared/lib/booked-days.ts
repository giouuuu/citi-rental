import { addDaysToKey, daysBetweenKeys, parseDateKey } from "@/features/shared/lib/manila-time";

/** An existing booking that blocks a car's calendar. */
export type BlockedRange = {
  /** ISO timestamp or `YYYY-MM-DDTHH:mm`. */
  startAt: string;
  endAt: string;
  /** Who holds it, e.g. "RNT-260715-001 · Reserved". Staff screens only — omit on public pages. */
  label?: string;
};

/** Longest stretch one booking may paint, so a bad row can't spin the loop. */
const MAX_BLOCKED_DAYS = 400;

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

/**
 * Every day a booking touches, pick-up and return day included: a car going
 * out or coming back that day can't take a second booking on it.
 */
export function bookedDays(ranges: BlockedRange[]): Map<string, BlockedRange[]> {
  const days = new Map<string, BlockedRange[]>();
  for (const range of ranges) {
    const from = wallClockDateKey(range.startAt);
    const to = wallClockDateKey(range.endAt);
    if (!from || !to || to < from) continue;
    const span = Math.min(daysBetweenKeys(from, to), MAX_BLOCKED_DAYS);
    for (let offset = 0; offset < span; offset += 1) {
      const key = addDaysToKey(from, offset);
      days.set(key, [...(days.get(key) ?? []), range]);
    }
  }
  return days;
}

/** The first booked day from `from` through `to`, inclusive; null when clear. */
export function firstBookedDayBetween(
  from: string,
  to: string,
  booked: Map<string, unknown>,
): string | null {
  for (let key = from; key <= to; key = addDaysToKey(key, 1)) {
    if (booked.has(key)) return key;
  }
  return null;
}
