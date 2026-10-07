import {
  daysBetweenKeys,
  manilaDateKey,
  parseDateKey,
  parseManilaDateTimeInput,
} from "@/features/shared/lib/manila-time";

export { formatPhp } from "@/features/shared/lib/money";

/** Inclusive calendar days between start and end (min 1). */
export function rentalDayCount(
  start?: string | null,
  end?: string | null,
): number | null {
  if (!start?.trim() || !end?.trim()) return null;

  const startKey = philippineDayKey(start);
  const endKey = philippineDayKey(end);
  if (!startKey || !endKey || endKey < startKey) {
    return null;
  }

  return Math.max(1, daysBetweenKeys(startKey, endKey));
}

export function quoteRentalTotal(
  dailyRate: number,
  start?: string | null,
  end?: string | null,
) {
  const days = rentalDayCount(start, end);
  if (days == null) return null;
  return { days, dailyRate, total: dailyRate * days };
}

export function quoteDeposit(total: number, percent = 30) {
  const deposit = Math.round(total * (percent / 100));
  return {
    percent,
    deposit,
    balance: Math.max(0, total - deposit),
  };
}

/** The Philippine calendar day of a date key, picker value, or stored timestamp. */
function philippineDayKey(value: string) {
  const trimmed = value.trim();
  const key = parseDateKey(trimmed);
  if (key) return key;
  if (parseManilaDateTimeInput(trimmed)) return trimmed.slice(0, 10);
  const instant = new Date(trimmed);
  return Number.isFinite(instant.getTime()) ? manilaDateKey(instant) : null;
}
