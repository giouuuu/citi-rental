/**
 * Canonical business timezone helpers. The Philippines has no daylight saving,
 * so Manila is a fixed UTC+8 and day boundaries are plain offset arithmetic.
 *
 * A "date key" is a Manila local calendar date as `YYYY-MM-DD` — the same
 * shape a native date input and a Postgres `date` use.
 */
export const MANILA_TIME_ZONE = "Asia/Manila";

const MANILA_OFFSET_MS = 8 * 3_600_000;
const DAY_MS = 86_400_000;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Manila calendar date of an instant. */
export function manilaDateKey(instant: Date): string {
  return new Date(instant.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Parses a `YYYY-MM-DD` key; null when malformed or not a real date. */
export function parseDateKey(value: string | null | undefined): string | null {
  if (!value || !DATE_KEY.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === value ? value : null;
}

/** The instant Manila midnight begins on `key`. */
export function manilaDayStart(key: string): Date {
  return new Date(new Date(`${key}T00:00:00.000Z`).getTime() - MANILA_OFFSET_MS);
}

/** The instant the Manila day after `key` begins (exclusive end of `key`). */
export function manilaDayEnd(key: string): Date {
  return new Date(manilaDayStart(key).getTime() + DAY_MS);
}

/** An instant as Manila wall-clock `YYYY-MM-DDTHH:mm`, the shape `DateTimePicker` speaks. */
export function manilaDateTimeInput(instant: Date): string {
  return new Date(instant.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 16);
}

/** Reads a `YYYY-MM-DDTHH:mm` picker value as Manila time; null when malformed. */
export function parseManilaDateTimeInput(value: string | null | undefined): Date | null {
  const match = value?.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/);
  if (!match || !parseDateKey(match[1])) return null;
  const [hours, minutes] = [Number(match[2]), Number(match[3])];
  if (hours > 23 || minutes > 59) return null;
  return new Date(manilaDayStart(match[1]).getTime() + (hours * 60 + minutes) * 60_000);
}

export function addDaysToKey(key: string, days: number): string {
  return new Date(new Date(`${key}T00:00:00.000Z`).getTime() + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** First-of-month key `months` away from a first-of-month key. */
export function addMonthsToKey(monthStart: string, months: number): string {
  const [year, month] = monthStart.split("-").map(Number);
  const index = year * 12 + (month - 1) + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-01`;
}

/** Inclusive count of calendar days from `from` to `to`. */
export function daysBetweenKeys(from: string, to: string): number {
  const diff =
    new Date(`${to}T00:00:00.000Z`).getTime() -
    new Date(`${from}T00:00:00.000Z`).getTime();
  return Math.round(diff / DAY_MS) + 1;
}

const keyFormatters = {
  day: new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "UTC" }),
  long: new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }),
  month: new Intl.DateTimeFormat("en-PH", { month: "short", year: "numeric", timeZone: "UTC" }),
};

/** Formats a date key without shifting it through the machine's local zone. */
export function formatDateKey(key: string, style: keyof typeof keyFormatters = "long") {
  return keyFormatters[style].format(new Date(`${key}T00:00:00.000Z`));
}

const instantFormatters = {
  date: new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: MANILA_TIME_ZONE,
  }),
  time: new Intl.DateTimeFormat("en-PH", { timeStyle: "short", timeZone: MANILA_TIME_ZONE }),
  dateTime: new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: MANILA_TIME_ZONE,
  }),
  weekday: new Intl.DateTimeFormat("en-PH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: MANILA_TIME_ZONE,
  }),
};

/** Formats an instant in Manila time. */
export function formatManila(
  instant: Date | string,
  style: keyof typeof instantFormatters = "dateTime",
) {
  return instantFormatters[style].format(new Date(instant));
}
