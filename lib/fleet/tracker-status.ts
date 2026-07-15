export type TrackerConnectionStatus = "online" | "delayed" | "offline" | "unknown";

type TrackerThresholds = {
  onlineMinutes: number;
  delayedMinutes: number;
};

const defaultThresholds: TrackerThresholds = {
  onlineMinutes: 5,
  delayedMinutes: 15,
};

export function getTrackerConnectionStatus(
  lastUpdate: Date | string | null,
  now = new Date(),
  thresholds = defaultThresholds,
): TrackerConnectionStatus {
  if (!lastUpdate) {
    return "unknown";
  }

  const updatedAt = new Date(lastUpdate);
  const ageMinutes = (now.getTime() - updatedAt.getTime()) / 60_000;

  if (Number.isNaN(ageMinutes) || ageMinutes < 0) {
    return "unknown";
  }

  if (ageMinutes <= thresholds.onlineMinutes) {
    return "online";
  }

  if (ageMinutes <= thresholds.delayedMinutes) {
    return "delayed";
  }

  return "offline";
}
