import type {
  AnalyticsBucket,
  AnalyticsOverview,
  AnalyticsTimeseriesPoint,
  TopCustomer,
  VehiclePerformance,
} from "@/features/analytics/types/analytics";
import {
  demoCollected,
  type DemoPayment,
  type DemoRental,
  type DemoWorkspace,
} from "@/features/shared/lib/demo-workspace";
import {
  addDaysToKey,
  daysBetweenKeys,
  manilaDateKey,
  manilaDayEnd,
  manilaDayStart,
} from "@/features/shared/lib/manila-time";

/**
 * Demo-mode stand-ins for the analytics RPCs. They apply the same definitions
 * as `20260929103000_analytics_rpcs.sql` — collected excludes penalties and
 * nets refunds, occupancy runs to the actual (or, while out, extended) return,
 * a partial day counts as a day — so demo numbers behave like real ones.
 */

const DAY_MS = 86_400_000;
const LATE_GRACE_MS = 3_600_000;
const OCCUPYING = new Set(["reserved", "active", "overdue", "completed"]);

type Range = { start: number; end: number };

function windowRange(from: string, to: string): Range {
  return { start: manilaDayStart(from).getTime(), end: manilaDayEnd(to).getTime() };
}

function inRange(iso: string | null, range: Range) {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  return time >= range.start && time < range.end;
}

function occupiedInterval(rental: DemoRental, now: Date): Range {
  const start = new Date(rental.startAt).getTime();
  const expected = new Date(rental.expectedReturnAt).getTime();
  let end = expected;
  if (rental.actualReturnAt) end = new Date(rental.actualReturnAt).getTime();
  else if (rental.status === "active" || rental.status === "overdue") end = Math.max(expected, now.getTime());
  return { start, end };
}

function rentedDaysIn(rental: DemoRental, range: Range, now: Date) {
  const interval = occupiedInterval(rental, now);
  const overlap = Math.min(interval.end, range.end) - Math.max(interval.start, range.start);
  return overlap > 0 ? Math.ceil(overlap / DAY_MS) : 0;
}

function isLate(rental: DemoRental) {
  return (
    rental.status === "completed" &&
    rental.actualReturnAt !== null &&
    new Date(rental.actualReturnAt).getTime() > new Date(rental.expectedReturnAt).getTime() + LATE_GRACE_MS
  );
}

function fleetSizeOn(workspace: DemoWorkspace, dayKey: string) {
  const end = manilaDayEnd(dayKey).getTime();
  return workspace.vehicles.filter(
    (vehicle) => vehicle.status !== "inactive" && new Date(vehicle.createdAt).getTime() < end,
  ).length;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function paymentsByRental(payments: DemoPayment[]) {
  const map = new Map<string, DemoPayment[]>();
  for (const payment of payments) {
    const bucket = map.get(payment.rentalId);
    if (bucket) bucket.push(payment);
    else map.set(payment.rentalId, [payment]);
  }
  return map;
}

function outstandingFor(rental: DemoRental, payments: DemoPayment[]) {
  // Only cars that went out owe anything; a reserved balance is due at pickup.
  if (!["active", "overdue", "completed"].includes(rental.status)) return 0;
  const penalties = sum(payments.filter((p) => p.paymentType === "penalty").map((p) => p.amount));
  return Math.max(0, rental.quotedTotal + penalties - demoCollected(payments));
}

export function demoOverview(
  workspace: DemoWorkspace,
  from: string,
  to: string,
  now: Date = new Date(),
): AnalyticsOverview {
  const range = windowRange(from, to);
  const { rentals, payments, customers } = workspace;
  const ledger = paymentsByRental(payments);
  const windowPayments = payments.filter((payment) => inRange(payment.confirmedAt, range));
  const created = rentals.filter((rental) => inRange(rental.createdAt, range));
  const occupying = rentals.filter((rental) => OCCUPYING.has(rental.status));
  const startedInWindow = occupying.filter((rental) => inRange(rental.startAt, range));
  const leadRentals = created.filter((r) => r.status !== "draft" && r.status !== "cancelled");

  const todayKey = manilaDateKey(now);
  let fleetVehicleDays = 0;
  for (let key = from; key <= to && key <= todayKey; key = addDaysToKey(key, 1)) {
    fleetVehicleDays += fleetSizeOn(workspace, key);
  }

  const firstStart = new Map<string, number>();
  for (const rental of occupying) {
    const start = new Date(rental.startAt).getTime();
    const current = firstStart.get(rental.customerId);
    if (current === undefined || start < current) firstStart.set(rental.customerId, start);
  }
  const activeCustomers = new Set(startedInWindow.map((rental) => rental.customerId));
  const newCustomers = [...activeCustomers].filter((id) => {
    const first = firstStart.get(id);
    return first !== undefined && first >= range.start && first < range.end;
  });

  return {
    bookingsCreated: created.length,
    bookingsPublic: created.filter((r) => r.bookingSource === "public_web").length,
    bookingsOps: created.filter((r) => r.bookingSource === "ops").length,
    draftsOpen: created.filter((r) => r.status === "draft").length,
    cancellations: rentals.filter((r) => inRange(r.cancelledAt, range)).length,
    completedRentals: rentals.filter((r) => r.status === "completed" && inRange(r.actualReturnAt, range)).length,
    lateReturns: rentals.filter((r) => isLate(r) && inRange(r.actualReturnAt, range)).length,
    overdueNow: rentals.filter(
      (r) => r.status === "overdue" || (r.status === "active" && new Date(r.expectedReturnAt) < now),
    ).length,
    collected: round2(demoCollected(windowPayments)),
    refunds: round2(sum(windowPayments.filter((p) => p.paymentType === "refund").map((p) => p.amount))),
    penaltiesBilled: round2(sum(windowPayments.filter((p) => p.paymentType === "penalty").map((p) => p.amount))),
    outstandingBalance: round2(sum(rentals.map((r) => outstandingFor(r, ledger.get(r.id) ?? [])))),
    rentedVehicleDays: sum(occupying.map((rental) => rentedDaysIn(rental, range, now))),
    fleetVehicleDays,
    avgRentalDays: startedInWindow.length
      ? Math.round(
          (sum(startedInWindow.map((r) => {
            const interval = occupiedInterval(r, now);
            return (interval.end - interval.start) / DAY_MS;
          })) / startedInWindow.length) * 10,
        ) / 10
      : null,
    avgLeadTimeDays: leadRentals.length
      ? Math.round(
          (sum(leadRentals.map((r) => (new Date(r.startAt).getTime() - new Date(r.createdAt).getTime()) / DAY_MS)) /
            leadRentals.length) * 10,
        ) / 10
      : null,
    customersTotal: customers.length,
    customersBlocked: customers.filter((customer) => customer.isBlocked).length,
    customersActive: activeCustomers.size,
    customersNew: newCustomers.length,
    customersReturning: activeCustomers.size - newCustomers.length,
  };
}

function bucketStartOf(key: string, bucket: AnalyticsBucket): string {
  if (bucket === "day") return key;
  if (bucket === "month") return `${key.slice(0, 7)}-01`;
  const weekday = new Date(`${key}T00:00:00.000Z`).getUTCDay();
  return addDaysToKey(key, -((weekday + 6) % 7));
}

export function demoTimeseries(
  workspace: DemoWorkspace,
  from: string,
  to: string,
  bucket: AnalyticsBucket,
  now: Date = new Date(),
): AnalyticsTimeseriesPoint[] {
  const points = new Map<string, AnalyticsTimeseriesPoint>();
  const occupying = workspace.rentals.filter((rental) => OCCUPYING.has(rental.status));

  for (let key = from; key <= to; key = addDaysToKey(key, 1)) {
    const start = bucketStartOf(key, bucket);
    let point = points.get(start);
    if (!point) {
      point = {
        bucketStart: start,
        collected: 0,
        penaltiesBilled: 0,
        bookingsCreated: 0,
        bookingsPublic: 0,
        cancellations: 0,
        rentedVehicleDays: 0,
        fleetVehicleDays: 0,
      };
      points.set(start, point);
    }
    const day = windowRange(key, key);
    const dayPayments = workspace.payments.filter((payment) => inRange(payment.confirmedAt, day));
    const created = workspace.rentals.filter((rental) => inRange(rental.createdAt, day));
    point.collected = round2(point.collected + demoCollected(dayPayments));
    point.penaltiesBilled += sum(dayPayments.filter((p) => p.paymentType === "penalty").map((p) => p.amount));
    point.bookingsCreated += created.length;
    point.bookingsPublic += created.filter((r) => r.bookingSource === "public_web").length;
    point.cancellations += workspace.rentals.filter((r) => inRange(r.cancelledAt, day)).length;
    point.rentedVehicleDays += new Set(
      occupying.filter((rental) => rentedDaysIn(rental, day, now) > 0).map((rental) => rental.vehicleId),
    ).size;
    point.fleetVehicleDays += fleetSizeOn(workspace, key);
  }

  return [...points.values()];
}

export function demoVehiclePerformance(
  workspace: DemoWorkspace,
  from: string,
  to: string,
  now: Date = new Date(),
): VehiclePerformance[] {
  const range = windowRange(from, to);
  const windowDays = daysBetweenKeys(from, to);
  const rentalVehicle = new Map(workspace.rentals.map((rental) => [rental.id, rental.vehicleId]));

  return workspace.vehicles
    .map((vehicle) => {
      const own = workspace.rentals.filter((rental) => rental.vehicleId === vehicle.id);
      const occupying = own.filter((rental) => OCCUPYING.has(rental.status));
      const overlapping = occupying.filter((rental) => rentedDaysIn(rental, range, now) > 0);
      const windowPayments = workspace.payments.filter(
        (payment) => rentalVehicle.get(payment.rentalId) === vehicle.id && inRange(payment.confirmedAt, range),
      );
      const returns = own
        .filter((r) => r.status === "completed" && r.actualReturnAt && new Date(r.actualReturnAt) <= now)
        .map((r) => r.actualReturnAt!)
        .sort();
      const upcoming = own
        .filter((r) => r.status === "reserved" && new Date(r.startAt) > now)
        .map((r) => r.startAt)
        .sort();

      return {
        vehicleId: vehicle.id,
        plateNumber: vehicle.plateNumber,
        name: vehicle.name,
        category: vehicle.category,
        status: vehicle.status,
        dailyRate: vehicle.dailyRate,
        rentalCount: overlapping.length,
        rentedDays: sum(occupying.map((rental) => rentedDaysIn(rental, range, now))),
        windowDays,
        collected: round2(demoCollected(windowPayments)),
        penaltiesBilled: sum(windowPayments.filter((p) => p.paymentType === "penalty").map((p) => p.amount)),
        lastReturnAt: returns.at(-1) ?? null,
        nextStartAt: upcoming[0] ?? null,
        onRentNow: own.some((r) => r.status === "active" || r.status === "overdue"),
      };
    })
    .sort((a, b) => b.collected - a.collected || a.plateNumber.localeCompare(b.plateNumber));
}

export function demoTopCustomers(
  workspace: DemoWorkspace,
  from: string,
  to: string,
  limit = 10,
): TopCustomer[] {
  const range = windowRange(from, to);
  const ledger = paymentsByRental(workspace.payments);

  return workspace.customers
    .map((customer) => {
      const own = workspace.rentals.filter((rental) => rental.customerId === customer.id);
      const occupying = own.filter((rental) => OCCUPYING.has(rental.status));
      const ownPayments = own.flatMap((rental) => ledger.get(rental.id) ?? []);
      const starts = occupying.map((rental) => rental.startAt).sort();
      return {
        customerId: customer.id,
        fullName: customer.fullName,
        phoneNumber: customer.phoneNumber,
        isBlocked: customer.isBlocked,
        rentalsInWindow: occupying.filter((rental) => inRange(rental.startAt, range)).length,
        rentalsLifetime: occupying.length,
        collectedInWindow: round2(demoCollected(ownPayments.filter((p) => inRange(p.confirmedAt, range)))),
        collectedLifetime: round2(demoCollected(ownPayments)),
        outstanding: round2(sum(own.map((rental) => outstandingFor(rental, ledger.get(rental.id) ?? [])))),
        lateReturnsLifetime: own.filter(isLate).length,
        firstRentalAt: starts[0] ?? null,
        lastRentalAt: starts.at(-1) ?? null,
      };
    })
    .filter((row) => row.rentalsInWindow > 0 || row.collectedInWindow > 0)
    .sort(
      (a, b) =>
        b.collectedInWindow - a.collectedInWindow ||
        b.rentalsInWindow - a.rentalsInWindow ||
        a.fullName.localeCompare(b.fullName),
    )
    .slice(0, Math.min(50, Math.max(1, limit)));
}
