import {
  addDaysToKey,
  addMonthsToKey,
  daysBetweenKeys,
  formatDateKey,
} from "@/features/shared/lib/manila-time";

/** An inclusive range of Manila date keys (`YYYY-MM-DD`). */
export type DateRangeValue = { from: string; to: string };

/**
 * One entry in a date range picker's preset rail. `value` is what the caller
 * puts in the URL when it has a code for it (`2026-Q3`, `30d`); `group` is the
 * rail heading it sits under.
 */
export type DateRangePreset = DateRangeValue & {
  value: string;
  label: string;
  group?: string;
};

export type QuickPresetKey =
  | "today"
  | "yesterday"
  | "last-7-days"
  | "last-30-days"
  | "last-90-days"
  | "this-week"
  | "last-week"
  | "this-month"
  | "last-month"
  | "this-quarter"
  | "last-quarter"
  | "year-to-date"
  | "last-year";

export const DEFAULT_QUICK_PRESETS: QuickPresetKey[] = [
  "today",
  "yesterday",
  "last-7-days",
  "last-30-days",
  "this-week",
  "last-week",
  "this-month",
  "last-month",
  "year-to-date",
  "last-year",
];

const monthLabel = new Intl.DateTimeFormat("en-PH", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function monthStartOf(key: string) {
  return `${key.slice(0, 7)}-01`;
}

function quarterStartOf(key: string) {
  const month = Number(key.slice(5, 7));
  return addMonthsToKey(`${key.slice(0, 4)}-01-01`, Math.floor((month - 1) / 3) * 3);
}

function lastDayBefore(key: string) {
  return addDaysToKey(key, -1);
}

/** Weeks run Sunday to Saturday, matching the calendar grid. */
function weekStartOf(key: string) {
  const weekday = new Date(`${key}T00:00:00.000Z`).getUTCDay();
  return addDaysToKey(key, -weekday);
}

function quickRange(key: QuickPresetKey, today: string): DateRangeValue & { label: string } {
  switch (key) {
    case "today":
      return { label: "Today", from: today, to: today };
    case "yesterday": {
      const day = addDaysToKey(today, -1);
      return { label: "Yesterday", from: day, to: day };
    }
    case "last-7-days":
      return { label: "Last 7 days", from: addDaysToKey(today, -6), to: today };
    case "last-30-days":
      return { label: "Last 30 days", from: addDaysToKey(today, -29), to: today };
    case "last-90-days":
      return { label: "Last 90 days", from: addDaysToKey(today, -89), to: today };
    case "this-week": {
      const from = weekStartOf(today);
      return { label: "This week", from, to: addDaysToKey(from, 6) };
    }
    case "last-week": {
      const from = addDaysToKey(weekStartOf(today), -7);
      return { label: "Last week", from, to: addDaysToKey(from, 6) };
    }
    case "this-month": {
      const from = monthStartOf(today);
      return { label: "This month", from, to: lastDayBefore(addMonthsToKey(from, 1)) };
    }
    case "last-month": {
      const from = addMonthsToKey(monthStartOf(today), -1);
      return { label: "Last month", from, to: lastDayBefore(addMonthsToKey(from, 1)) };
    }
    case "this-quarter": {
      const from = quarterStartOf(today);
      return { label: "This quarter", from, to: lastDayBefore(addMonthsToKey(from, 3)) };
    }
    case "last-quarter": {
      const from = addMonthsToKey(quarterStartOf(today), -3);
      return { label: "Last quarter", from, to: lastDayBefore(addMonthsToKey(from, 3)) };
    }
    case "year-to-date":
      return { label: "Year to date", from: `${today.slice(0, 4)}-01-01`, to: today };
    case "last-year": {
      const year = Number(today.slice(0, 4)) - 1;
      return { label: "Last year", from: `${year}-01-01`, to: `${year}-12-31` };
    }
  }
}

/** Relative ranges anchored on `today`: Today, Last 7 days, This month, … */
export function quickDateRangePresets(
  today: string,
  keys: QuickPresetKey[] = DEFAULT_QUICK_PRESETS,
  group?: string,
): DateRangePreset[] {
  return keys.map((key) => ({ value: key, group, ...quickRange(key, today) }));
}

/** Calendar quarters, newest first, starting with the one `today` is in. */
export function quarterDateRangePresets(
  today: string,
  count = 4,
  group = "Quarters",
): DateRangePreset[] {
  const current = quarterStartOf(today);
  return Array.from({ length: count }, (_, offset) => {
    const from = addMonthsToKey(current, -3 * offset);
    const quarter = Math.floor((Number(from.slice(5, 7)) - 1) / 3) + 1;
    return {
      value: `${from.slice(0, 4)}-Q${quarter}`,
      label: `Q${quarter} ${from.slice(0, 4)}`,
      group,
      from,
      to: lastDayBefore(addMonthsToKey(from, 3)),
    };
  });
}

/** Calendar months, newest first, starting with the one `today` is in. */
export function monthDateRangePresets(
  today: string,
  count = 12,
  group = "Months",
): DateRangePreset[] {
  const current = monthStartOf(today);
  return Array.from({ length: count }, (_, offset) => {
    const from = addMonthsToKey(current, -offset);
    return {
      value: from.slice(0, 7),
      label: monthLabel.format(new Date(`${from}T00:00:00.000Z`)),
      group,
      from,
      to: lastDayBefore(addMonthsToKey(from, 1)),
    };
  });
}

/** Calendar years, newest first, starting with the one `today` is in. */
export function yearDateRangePresets(
  today: string,
  count = 3,
  group = "Years",
): DateRangePreset[] {
  const year = Number(today.slice(0, 4));
  return Array.from({ length: count }, (_, offset) => ({
    value: String(year - offset),
    label: String(year - offset),
    group,
    from: `${year - offset}-01-01`,
    to: `${year - offset}-12-31`,
  }));
}

/** The rail most lists want: quick ranges, then quarters, months and years. */
export function defaultDateRangePresets(today: string): DateRangePreset[] {
  return [
    ...quickDateRangePresets(today, DEFAULT_QUICK_PRESETS, "Quick"),
    ...quarterDateRangePresets(today),
    ...monthDateRangePresets(today),
    ...yearDateRangePresets(today),
  ];
}

/**
 * The preset a range corresponds to: the named one when the URL carries a
 * code, else the first preset covering exactly the same days.
 */
export function matchDateRangePreset(
  presets: readonly DateRangePreset[],
  range: { from?: string | null; to?: string | null } | null | undefined,
  value?: string | null,
): DateRangePreset | null {
  if (value) {
    const named = presets.find((preset) => preset.value === value);
    if (named) return named;
  }
  if (!range?.from || !range.to) return null;
  return presets.find((preset) => preset.from === range.from && preset.to === range.to) ?? null;
}

/** "Oct 4, 2026", "Oct 1 – 4, 2026", "Sep 28 – Oct 4, 2026", or across years. */
export function formatDateRange(range: DateRangeValue): string {
  const { from, to } = range;
  if (from === to) return formatDateKey(from);
  if (from.slice(0, 4) !== to.slice(0, 4)) {
    return `${formatDateKey(from)} – ${formatDateKey(to)}`;
  }
  if (from.slice(0, 7) === to.slice(0, 7)) {
    return `${formatDateKey(from, "day")} – ${Number(to.slice(8, 10))}, ${to.slice(0, 4)}`;
  }
  return `${formatDateKey(from, "day")} – ${formatDateKey(to)}`;
}

export function dateRangeDays(range: DateRangeValue): number {
  return daysBetweenKeys(range.from, range.to);
}
