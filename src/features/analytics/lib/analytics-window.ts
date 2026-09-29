import {
  addDaysToKey,
  daysBetweenKeys,
  manilaDateKey,
  parseDateKey,
} from "@/features/shared/lib/manila-time";
import type {
  AnalyticsBucket,
  AnalyticsPreset,
  AnalyticsWindow,
} from "@/features/analytics/types/analytics";

export const DEFAULT_ANALYTICS_PRESET: AnalyticsPreset = "30d";

/** Mirrors the 400-day ceiling the analytics RPCs enforce. */
export const MAX_ANALYTICS_DAYS = 400;

const PRESET_DAYS: Record<Exclude<AnalyticsPreset, "custom">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "12m": 365,
};

export const ANALYTICS_PRESETS: { value: AnalyticsPreset; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "12m", label: "Last 12 months" },
  { value: "custom", label: "Custom range" },
];

const BUCKETS: AnalyticsBucket[] = ["day", "week", "month"];

/** The bucket that keeps a chart readable: ≤ ~31 days → day, ≤ ~5 months → week. */
export function defaultBucketFor(days: number): AnalyticsBucket {
  if (days <= 31) return "day";
  if (days <= 150) return "week";
  return "month";
}

function isPreset(value: string | null): value is Exclude<AnalyticsPreset, "custom"> {
  return value !== null && value in PRESET_DAYS;
}

/**
 * Resolves `?range=&from=&to=&bucket=` into a window. Explicit, valid dates win
 * over a preset; anything malformed falls back to the default preset so a bad
 * link still renders. Windows end today unless dates say otherwise.
 */
export function resolveAnalyticsWindow(
  params: {
    range?: string | null;
    from?: string | null;
    to?: string | null;
    bucket?: string | null;
  },
  now: Date = new Date(),
): AnalyticsWindow {
  const today = manilaDateKey(now);
  const customFrom = parseDateKey(params.from);
  const customTo = parseDateKey(params.to);

  let from: string;
  let to: string;
  let preset: AnalyticsPreset;

  if (customFrom && customTo && customFrom <= customTo) {
    from = customFrom;
    to = customTo;
    preset = "custom";
    if (daysBetweenKeys(from, to) > MAX_ANALYTICS_DAYS) {
      from = addDaysToKey(to, -(MAX_ANALYTICS_DAYS - 1));
    }
  } else {
    preset = isPreset(params.range ?? null)
      ? (params.range as Exclude<AnalyticsPreset, "custom">)
      : DEFAULT_ANALYTICS_PRESET;
    const span = PRESET_DAYS[preset as Exclude<AnalyticsPreset, "custom">];
    to = today;
    from = addDaysToKey(today, -(span - 1));
  }

  const days = daysBetweenKeys(from, to);
  const requested = params.bucket as AnalyticsBucket | null | undefined;
  const bucket = requested && BUCKETS.includes(requested) ? requested : defaultBucketFor(days);

  return {
    from,
    to,
    bucket,
    preset,
    days,
    previous: {
      from: addDaysToKey(from, -days),
      to: addDaysToKey(from, -1),
    },
  };
}

/**
 * Builds the analytics URL for a changed filter, dropping params that equal
 * their defaults so shared links stay short. Picking a preset clears custom
 * dates; editing either date pins both ends as a custom range.
 */
export function analyticsUrl(
  current: URLSearchParams,
  change:
    | { range: AnalyticsPreset }
    | { custom: { from: string; to: string } }
    | { bucket: AnalyticsBucket | "auto" },
  pathname = "/analytics",
): string {
  const next = new URLSearchParams(current.toString());

  if ("range" in change) {
    next.delete("from");
    next.delete("to");
    if (change.range === DEFAULT_ANALYTICS_PRESET || change.range === "custom") {
      next.delete("range");
    } else {
      next.set("range", change.range);
    }
  } else if ("custom" in change) {
    // Both ends go in the URL: a lone date would fall back to the preset.
    next.delete("range");
    for (const key of ["from", "to"] as const) {
      const value = change.custom[key];
      if (value) next.set(key, value);
      else next.delete(key);
    }
  } else if (change.bucket === "auto") {
    next.delete("bucket");
  } else {
    next.set("bucket", change.bucket);
  }

  const search = next.toString();
  return search ? `${pathname}?${search}` : pathname;
}
