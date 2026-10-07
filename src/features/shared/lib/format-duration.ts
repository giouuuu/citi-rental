const MINUTE_MS = 60_000;

function unit(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Elapsed time between two instants as "3 days 23 hours", "1 day 30 min" or
 * "18 hours". Null when the end is not after the start.
 */
export function formatDuration(start: Date, end: Date): string | null {
  const totalMinutes = Math.round((end.getTime() - start.getTime()) / MINUTE_MS);
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return null;

  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  return [
    days ? unit(days, "day", "days") : null,
    hours ? unit(hours, "hour", "hours") : null,
    minutes ? `${minutes} min` : null,
  ]
    .filter(Boolean)
    .join(" ");
}
