export type ReportWindow = { from: Date; to: Date; fromValue: string; toValue: string };

const DAY_MS = 86_400_000;

function parseDay(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function toInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Resolves the `from`/`to` query params into a window, defaulting to the last
 * 30 days. Shared by the reports screen and the CSV route so both interpret the
 * same URL identically — a divergence here would silently export a different
 * period than the one on screen.
 */
export function resolveReportWindow(
  params: { from?: string | null; to?: string | null },
  now: Date = new Date(),
): ReportWindow {
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  const to = parseDay(params.to) ?? new Date(today.getTime() + DAY_MS);
  const fallbackFrom = new Date(to.getTime() - 30 * DAY_MS);
  const parsedFrom = parseDay(params.from);
  const from = parsedFrom && parsedFrom < to ? parsedFrom : fallbackFrom;

  return {
    from,
    to,
    fromValue: toInputValue(from),
    toValue: toInputValue(to),
  };
}
