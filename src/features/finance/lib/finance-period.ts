import {
  addDaysToKey,
  addMonthsToKey,
  daysBetweenKeys,
  formatDateKey,
  manilaDateKey,
  parseDateKey,
} from "@/features/shared/lib/manila-time";

/** Mirrors the 400-day ceiling `finance_statement` enforces. */
export const MAX_FINANCE_DAYS = 400;

export type FinancePeriodKind = "month" | "quarter" | "year" | "ytd" | "custom";

/** A resolved statement window of Manila local dates, both inclusive. */
export type FinanceWindow = {
  from: string;
  to: string;
  kind: FinancePeriodKind;
  /** The `?period=` code this window came from; null for custom dates. */
  period: string | null;
  label: string;
  days: number;
};

/** A picker preset: a `?period=` code plus the days it covers. */
export type FinancePeriodOption = {
  value: string;
  label: string;
  group: string;
  from: string;
  to: string;
};

const MONTH_CODE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const QUARTER_CODE = /^(\d{4})-Q([1-4])$/;
const YEAR_CODE = /^FY(\d{4})$/;

const monthFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export { addMonthsToKey };

function monthEnd(monthStart: string, months = 1) {
  return addDaysToKey(addMonthsToKey(monthStart, months), -1);
}

/**
 * Fiscal years are named by the calendar year they START in. With the default
 * January start this is just the calendar year.
 */
export function fiscalYearOf(dateKey: string, fiscalStartMonth: number): number {
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(5, 7));
  return month >= fiscalStartMonth ? year : year - 1;
}

export function fiscalYearStart(fiscalYear: number, fiscalStartMonth: number): string {
  return `${fiscalYear}-${pad(fiscalStartMonth)}-01`;
}

function fiscalQuarterOf(dateKey: string, fiscalStartMonth: number) {
  const fiscalYear = fiscalYearOf(dateKey, fiscalStartMonth);
  const start = fiscalYearStart(fiscalYear, fiscalStartMonth);
  const monthIndex =
    (Number(dateKey.slice(0, 4)) - Number(start.slice(0, 4))) * 12 +
    Number(dateKey.slice(5, 7)) -
    Number(start.slice(5, 7));
  return { fiscalYear, quarter: Math.floor(monthIndex / 3) + 1 };
}

function yearLabel(fiscalYear: number, fiscalStartMonth: number) {
  return fiscalStartMonth === 1 ? String(fiscalYear) : `FY${fiscalYear}`;
}

function quarterLabel(fiscalYear: number, quarter: number, fiscalStartMonth: number) {
  return `Q${quarter} ${yearLabel(fiscalYear, fiscalStartMonth)}`;
}

function windowFor(
  code: string,
  fiscalStartMonth: number,
  today: string,
): Omit<FinanceWindow, "days"> | null {
  if (code === "ytd") {
    const fiscalYear = fiscalYearOf(today, fiscalStartMonth);
    return {
      from: fiscalYearStart(fiscalYear, fiscalStartMonth),
      to: today,
      kind: "ytd",
      period: "ytd",
      label: `${yearLabel(fiscalYear, fiscalStartMonth)} year to date`,
    };
  }

  const month = MONTH_CODE.exec(code);
  if (month) {
    const from = `${month[1]}-${month[2]}-01`;
    return {
      from,
      to: monthEnd(from),
      kind: "month",
      period: code,
      label: monthFormatter.format(new Date(`${from}T00:00:00.000Z`)),
    };
  }

  const quarter = QUARTER_CODE.exec(code);
  if (quarter) {
    const fiscalYear = Number(quarter[1]);
    const index = Number(quarter[2]);
    const from = addMonthsToKey(fiscalYearStart(fiscalYear, fiscalStartMonth), (index - 1) * 3);
    return {
      from,
      to: monthEnd(from, 3),
      kind: "quarter",
      period: code,
      label: quarterLabel(fiscalYear, index, fiscalStartMonth),
    };
  }

  const year = YEAR_CODE.exec(code);
  if (year) {
    const fiscalYear = Number(year[1]);
    const from = fiscalYearStart(fiscalYear, fiscalStartMonth);
    return {
      from,
      to: monthEnd(from, 12),
      kind: "year",
      period: code,
      label: yearLabel(fiscalYear, fiscalStartMonth),
    };
  }

  return null;
}

/** The current fiscal quarter: the period a bookkeeper is usually closing. */
export function defaultFinancePeriod(fiscalStartMonth: number, now: Date = new Date()): string {
  const { fiscalYear, quarter } = fiscalQuarterOf(manilaDateKey(now), fiscalStartMonth);
  return `${fiscalYear}-Q${quarter}`;
}

/**
 * Resolves `?period=` or `?from=&to=` into a window. Valid custom dates win;
 * anything malformed falls back to the current fiscal quarter so a bad link
 * still renders.
 */
export function resolveFinanceWindow(
  params: { period?: string | null; from?: string | null; to?: string | null },
  fiscalStartMonth = 1,
  now: Date = new Date(),
  /** The page's default period code; the current fiscal quarter if omitted. */
  fallbackPeriod?: string,
): FinanceWindow {
  const today = manilaDateKey(now);
  const customFrom = parseDateKey(params.from);
  const customTo = parseDateKey(params.to);

  if (customFrom && customTo && customFrom <= customTo) {
    const from =
      daysBetweenKeys(customFrom, customTo) > MAX_FINANCE_DAYS
        ? addDaysToKey(customTo, -(MAX_FINANCE_DAYS - 1))
        : customFrom;
    return {
      from,
      to: customTo,
      kind: "custom",
      period: null,
      label: `${formatDateKey(from)} – ${formatDateKey(customTo)}`,
      days: daysBetweenKeys(from, customTo),
    };
  }

  const resolved =
    (params.period ? windowFor(params.period, fiscalStartMonth, today) : null) ??
    (fallbackPeriod ? windowFor(fallbackPeriod, fiscalStartMonth, today) : null) ??
    windowFor(defaultFinancePeriod(fiscalStartMonth, now), fiscalStartMonth, today)!;
  return { ...resolved, days: daysBetweenKeys(resolved.from, resolved.to) };
}

/** Choices for the period picker: YTD, recent quarters, months, years. */
export function financePeriodOptions(
  fiscalStartMonth = 1,
  now: Date = new Date(),
): FinancePeriodOption[] {
  const today = manilaDateKey(now);
  const codes: { value: string; group: string }[] = [{ value: "ytd", group: "Running" }];

  const { fiscalYear, quarter } = fiscalQuarterOf(today, fiscalStartMonth);
  for (let offset = 0; offset < 6; offset += 1) {
    const index = (fiscalYear * 4 + quarter - 1) - offset;
    codes.push({ value: `${Math.floor(index / 4)}-Q${(index % 4) + 1}`, group: "Quarters" });
  }

  const thisMonth = `${today.slice(0, 7)}-01`;
  for (let offset = 0; offset < 12; offset += 1) {
    codes.push({ value: addMonthsToKey(thisMonth, -offset).slice(0, 7), group: "Months" });
  }

  for (let offset = 0; offset < 3; offset += 1) {
    codes.push({ value: `FY${fiscalYear - offset}`, group: "Years" });
  }

  return codes.map(({ value, group }) => {
    const window = windowFor(value, fiscalStartMonth, today)!;
    // The rail sits under its group heading, so YTD needs no year prefix.
    const label = window.kind === "ytd" ? "Year to date" : window.label;
    return { value, label, group, from: window.from, to: window.to };
  });
}

/**
 * Builds the finance URL for a changed period, dropping the param when it is
 * the default so shared links stay short. Editing a date pins both ends.
 */
export function financeUrl(
  current: URLSearchParams,
  change: { period: string } | { custom: { from: string; to: string } },
  defaultPeriod: string,
  pathname = "/finance",
): string {
  const next = new URLSearchParams(current.toString());

  if ("period" in change) {
    next.delete("from");
    next.delete("to");
    if (change.period === defaultPeriod) next.delete("period");
    else next.set("period", change.period);
  } else {
    next.delete("period");
    for (const key of ["from", "to"] as const) {
      const value = change.custom[key];
      if (value) next.set(key, value);
      else next.delete(key);
    }
  }

  const search = next.toString();
  return search ? `${pathname}?${search}` : pathname;
}
