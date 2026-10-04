import {
  addDaysToKey,
  manilaDateKey,
  manilaDayEnd,
  manilaDayStart,
  parseDateKey,
} from "@/features/shared/lib/manila-time";

/**
 * `fromValue`/`toValue` are inclusive Manila date keys (what the picker shows
 * and the URL carries); `from`/`to` are the instants bounding them, with `to`
 * exclusive — the start of the day after `toValue`.
 */
export type ReportWindow = { from: Date; to: Date; fromValue: string; toValue: string };

/**
 * Resolves the `from`/`to` query params into a window, defaulting to the last
 * 30 days through today. Shared by the reports screen and the CSV route so both
 * interpret the same URL identically — a divergence here would silently export
 * a different period than the one on screen.
 */
export function resolveReportWindow(
  params: { from?: string | null; to?: string | null },
  now: Date = new Date(),
): ReportWindow {
  const toValue = parseDateKey(params.to) ?? manilaDateKey(now);
  const parsedFrom = parseDateKey(params.from);
  const fromValue =
    parsedFrom && parsedFrom <= toValue ? parsedFrom : addDaysToKey(toValue, -29);

  return {
    from: manilaDayStart(fromValue),
    to: manilaDayEnd(toValue),
    fromValue,
    toValue,
  };
}
