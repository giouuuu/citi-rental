import type {
  DashboardRental,
  DashboardSnapshot,
} from "@/features/dashboard/types/dashboard";
import { addDaysToKey, manilaDateKey, manilaDayEnd } from "@/features/shared/lib/manila-time";

const UPCOMING_DAYS = 7;
const RECENT_LIMIT = 6;

const byTime = (key: "startAt" | "expectedReturnAt" | "createdAt", direction: 1 | -1 = 1) =>
  (a: DashboardRental, b: DashboardRental) =>
    direction * (new Date(a[key]).getTime() - new Date(b[key]).getTime());

/**
 * Buckets open rentals into the dashboard's views. Day boundaries are Manila
 * days, so "due back today" means today on the ops floor, not in UTC.
 *
 * `rentals` are open rentals (draft, reserved, active, overdue) with overdue
 * already derived; vehicle status is operational only and never implies
 * whether a car is out.
 */
export function buildDashboardSnapshot({
  vehicleStatuses,
  rentals,
  now = new Date(),
}: {
  vehicleStatuses: string[];
  rentals: DashboardRental[];
  now?: Date;
}): DashboardSnapshot {
  const todayKey = manilaDateKey(now);
  const endOfToday = manilaDayEnd(todayKey).getTime();
  const endOfWeek = manilaDayEnd(addDaysToKey(todayKey, UPCOMING_DAYS - 1)).getTime();
  const out = rentals.filter((r) => r.status === "active" || r.status === "overdue");
  const reserved = rentals.filter((r) => r.status === "reserved");
  const startsBy = (limit: number) => (r: DashboardRental) => new Date(r.startAt).getTime() < limit;

  return {
    todayKey,
    fleet: {
      total: vehicleStatuses.filter((status) => status !== "inactive").length,
      available: vehicleStatuses.filter((status) => status === "available").length,
      maintenance: vehicleStatuses.filter((status) => status === "maintenance").length,
    },
    onRentNow: out.length,
    overdue: out.filter((r) => r.status === "overdue").sort(byTime("expectedReturnAt")),
    dueBackToday: out
      .filter((r) => r.status === "active" && new Date(r.expectedReturnAt).getTime() < endOfToday)
      .sort(byTime("expectedReturnAt")),
    pickupsToday: reserved.filter(startsBy(endOfToday)).sort(byTime("startAt")),
    upcomingPickups: reserved
      .filter((r) => !startsBy(endOfToday)(r) && startsBy(endOfWeek)(r))
      .sort(byTime("startAt")),
    awaitingDeposit: rentals.filter((r) => r.status === "draft").sort(byTime("createdAt", -1)),
    recentBookings: [...rentals].sort(byTime("createdAt", -1)).slice(0, RECENT_LIMIT),
  };
}

/** Whole hours a rental is past its expected return. */
export function hoursLate(rental: Pick<DashboardRental, "expectedReturnAt">, now = new Date()) {
  return Math.max(0, Math.floor((now.getTime() - new Date(rental.expectedReturnAt).getTime()) / 3_600_000));
}
