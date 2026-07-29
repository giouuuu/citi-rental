import {
  eachDayOfInterval,
  format,
  isSameDay,
  parse,
  startOfDay,
} from "date-fns";
import type { DateRange } from "react-day-picker";

export type BookedDateRange = {
  startAt: string;
  expectedReturnAt: string;
};

const DEFAULT_TIME = "09:00";

export function parseDateTimeLocal(value?: string): Date | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = parse(value, "yyyy-MM-dd", new Date());
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (match) {
    const parsed = parse(
      `${match[1]} ${match[2]}`,
      "yyyy-MM-dd HH:mm",
      new Date(),
    );
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

export function toDateTimeLocal(date: Date, time = DEFAULT_TIME) {
  return `${format(date, "yyyy-MM-dd")}T${time}`;
}

/** Default times: 09:00 pick-up; same-day return 18:00 so end > start. */
export function toBookingRangeValues(from: Date, to?: Date) {
  const startAt = toDateTimeLocal(from, "09:00");
  if (!to) return { startAt, expectedReturnAt: "" };
  const sameDay = isSameDay(from, to);
  return {
    startAt,
    expectedReturnAt: toDateTimeLocal(to, sameDay ? "18:00" : "09:00"),
  };
}

export function expandBookedDays(ranges: BookedDateRange[]): Date[] {
  const days: Date[] = [];
  for (const range of ranges) {
    const start = parseDateTimeLocal(range.startAt);
    const end = parseDateTimeLocal(range.expectedReturnAt);
    if (!start || !end) continue;
    const from = startOfDay(start);
    const to = startOfDay(end);
    if (to.getTime() < from.getTime()) continue;
    days.push(...eachDayOfInterval({ start: from, end: to }));
  }
  return days;
}

export function isDayInList(day: Date, list: Date[]) {
  return list.some((d) => isSameDay(d, day));
}

export function rangeIncludesBooked(range: DateRange, bookedDays: Date[]) {
  if (!range.from || !range.to) return false;
  return eachDayOfInterval({
    start: startOfDay(range.from),
    end: startOfDay(range.to),
  }).some((day) => isDayInList(day, bookedDays));
}
