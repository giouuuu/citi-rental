import { differenceInCalendarDays, parseISO } from "date-fns";

const phpFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

/** Inclusive calendar days between start and end (min 1). */
export function rentalDayCount(
  start?: string | null,
  end?: string | null,
): number | null {
  if (!start?.trim() || !end?.trim()) return null;

  const startDate = parseFlexibleDate(start);
  const endDate = parseFlexibleDate(end);
  if (!startDate || !endDate || endDate.getTime() < startDate.getTime()) {
    return null;
  }

  return Math.max(1, differenceInCalendarDays(endDate, startDate) + 1);
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

export function formatPhp(amount: number) {
  return phpFormatter.format(amount);
}

function parseFlexibleDate(value: string) {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = parseISO(`${trimmed}T00:00:00`);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  const parsed = new Date(trimmed);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}
