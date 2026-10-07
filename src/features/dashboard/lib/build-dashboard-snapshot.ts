import type {
  DashboardHandover,
  DashboardRental,
  DashboardSnapshot,
  DashboardVehicle,
  FleetBoardCar,
  FleetCarState,
} from "@/features/dashboard/types/dashboard";
import { addDaysToKey, manilaDateKey, manilaDayEnd, manilaDayStart } from "@/features/shared/lib/manila-time";

const time = (value: string) => new Date(value).getTime();

const byTime = (key: "startAt" | "expectedReturnAt" | "createdAt", direction: 1 | -1 = 1) =>
  (a: DashboardRental, b: DashboardRental) => direction * (time(a[key]) - time(b[key]));

/** Problems first, then the day in time order. */
const URGENT = new Set<DashboardHandover["kind"]>(["overdue", "late_pickup"]);
function byHandover(a: DashboardHandover, b: DashboardHandover) {
  const urgency = Number(URGENT.has(b.kind)) - Number(URGENT.has(a.kind));
  return urgency || time(a.at) - time(b.at);
}

/** Free cars lead the board: they are what the owner can still rent out. */
const BOARD_ORDER: Record<FleetCarState, number> = { free: 0, out: 1, overdue: 2, maintenance: 3 };

function buildFleetBoard(vehicles: DashboardVehicle[], out: DashboardRental[], reserved: DashboardRental[]) {
  const board = vehicles
    .filter((vehicle) => vehicle.status !== "inactive")
    .map((vehicle): FleetBoardCar => {
      const current = out.find((r) => r.vehicleId === vehicle.id) ?? null;
      if (current) {
        return { vehicle, state: current.status === "overdue" ? "overdue" : "out", current, next: null };
      }
      if (vehicle.status === "maintenance") return { vehicle, state: "maintenance", current: null, next: null };
      // `reserved` is already sorted by start, so the first match is the next booking.
      const next = reserved.find((r) => r.vehicleId === vehicle.id) ?? null;
      return { vehicle, state: "free", current: null, next };
    });

  return board.sort(
    (a, b) =>
      BOARD_ORDER[a.state] - BOARD_ORDER[b.state] ||
      (a.current && b.current ? time(a.current.expectedReturnAt) - time(b.current.expectedReturnAt) : 0) ||
      a.vehicle.plateNumber.localeCompare(b.vehicle.plateNumber),
  );
}

/**
 * Buckets open rentals into the dashboard's views. Day boundaries are Manila
 * days, so "due back today" means today on the ops floor, not in UTC.
 *
 * `rentals` are open rentals (draft, reserved, active, overdue) with overdue
 * already derived; vehicle status is operational only and never implies
 * whether a car is out.
 */
export function buildDashboardSnapshot({
  vehicles,
  rentals,
  returnedToday = 0,
  collectedToday = 0,
  now = new Date(),
}: {
  vehicles: DashboardVehicle[];
  rentals: DashboardRental[];
  returnedToday?: number;
  collectedToday?: number;
  now?: Date;
}): DashboardSnapshot {
  const todayKey = manilaDateKey(now);
  const startOfToday = manilaDayStart(todayKey).getTime();
  const endOfToday = manilaDayEnd(todayKey).getTime();
  const endOfTomorrow = manilaDayEnd(addDaysToKey(todayKey, 1)).getTime();
  const nowMs = now.getTime();

  const out = rentals.filter((r) => r.status === "active" || r.status === "overdue");
  const reserved = rentals.filter((r) => r.status === "reserved").sort(byTime("startAt"));
  const drafts = rentals.filter((r) => r.status === "draft").sort(byTime("createdAt", -1));

  const overdue = out.filter((r) => r.status === "overdue").sort(byTime("expectedReturnAt"));
  const dueBackToday = out
    .filter((r) => r.status === "active" && time(r.expectedReturnAt) < endOfToday)
    .sort(byTime("expectedReturnAt"));
  // A reservation whose start has passed but never went out still needs handing over.
  const pickupsToday = reserved.filter((r) => time(r.startAt) < endOfToday);

  const handover = (kind: DashboardHandover["kind"], at: string, rental: DashboardRental): DashboardHandover => ({
    kind,
    at,
    lateHours: URGENT.has(kind) ? Math.max(0, Math.floor((nowMs - time(at)) / 3_600_000)) : 0,
    rental,
  });

  const handoversToday = [
    ...overdue.map((rental) => handover("overdue", rental.expectedReturnAt, rental)),
    ...dueBackToday.map((rental) => handover("return", rental.expectedReturnAt, rental)),
    ...pickupsToday.map((rental) =>
      handover(time(rental.startAt) < nowMs ? "late_pickup" : "release", rental.startAt, rental),
    ),
  ].sort(byHandover);

  const tomorrow = (value: string) => time(value) >= endOfToday && time(value) < endOfTomorrow;
  const handoversTomorrow = [
    ...out
      .filter((r) => r.status === "active" && tomorrow(r.expectedReturnAt))
      .map((rental) => handover("return", rental.expectedReturnAt, rental)),
    ...reserved.filter((r) => tomorrow(r.startAt)).map((rental) => handover("release", rental.startAt, rental)),
  ].sort(byHandover);

  const fleetBoard = buildFleetBoard(vehicles, out, reserved);
  const operational = vehicles.filter((v) => v.status !== "inactive");

  return {
    todayKey,
    fleet: {
      total: operational.length,
      available: operational.filter((v) => v.status === "available").length,
      maintenance: operational.filter((v) => v.status === "maintenance").length,
    },
    vehicles: operational,
    onRentNow: out.length,
    freeNow: fleetBoard.filter((car) => car.state === "free").length,
    overdue,
    dueBackToday,
    pickupsToday,
    releasedToday: out.filter((r) => time(r.startAt) >= startOfToday && time(r.startAt) < endOfToday).length,
    returnedToday,
    handoversToday,
    handoversTomorrow,
    proofsToVerify: drafts.filter((r) => r.paymentStatus === "proof_submitted"),
    awaitingDeposit: drafts.filter((r) => r.paymentStatus !== "proof_submitted"),
    fleetBoard,
    collectedToday,
    toCollectToday: handoversToday.reduce((sum, item) => sum + item.rental.balance, 0),
  };
}

/** Whole hours a rental is past its expected return. */
export function hoursLate(rental: Pick<DashboardRental, "expectedReturnAt">, now = new Date()) {
  return Math.max(0, Math.floor((now.getTime() - new Date(rental.expectedReturnAt).getTime()) / 3_600_000));
}

/** "5 hours late" under a day, "2 days late" after. */
export function lateness(hours: number) {
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} late`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} late`;
}
