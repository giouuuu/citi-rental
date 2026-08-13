export type RevenueRental = {
  id: string;
  vehicleId: string;
  vehicleName: string | null;
  plateNumber: string | null;
  startAt: string;
  expectedReturnAt: string;
  actualReturnAt: string | null;
  quotedTotal: number | null;
};

export type RevenuePayment = {
  rentalId: string;
  paymentType: "deposit" | "balance" | "penalty" | "refund" | "adjustment";
  amount: number;
};

export type VehicleRevenueRow = {
  vehicleId: string;
  vehicleName: string;
  plateNumber: string;
  rentalCount: number;
  rentedDays: number;
  utilizationPercent: number;
  quotedTotal: number;
  collected: number;
  penalties: number;
  outstanding: number;
};

const DAY_MS = 86_400_000;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Days a rental occupies inside [from, to), counting a partial day as a day.
 * A rental that starts before the window or ends after it is clamped to it, so
 * a report for one month never credits a vehicle with days from another.
 */
export function rentedDaysInWindow(
  rental: Pick<RevenueRental, "startAt" | "expectedReturnAt" | "actualReturnAt">,
  from: Date,
  to: Date,
): number {
  const start = new Date(rental.startAt).getTime();
  const end = new Date(rental.actualReturnAt ?? rental.expectedReturnAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;

  const clampedStart = Math.max(start, from.getTime());
  const clampedEnd = Math.min(end, to.getTime());
  if (clampedEnd <= clampedStart) return 0;

  return Math.ceil((clampedEnd - clampedStart) / DAY_MS);
}

/**
 * Revenue and utilization per vehicle over a window.
 *
 * `collected` counts confirmed deposits, balances, and adjustments minus
 * refunds; `penalties` (fuel and damage charges from return inspections) are
 * reported separately because they are billed, not yet collected. `outstanding`
 * is what the invoice still expects: quoted + penalties - collected, floored at
 * zero so an overpaid rental never shows a negative debt.
 */
export function aggregateVehicleRevenue({
  rentals,
  payments,
  from,
  to,
}: {
  rentals: RevenueRental[];
  payments: RevenuePayment[];
  from: Date;
  to: Date;
}): VehicleRevenueRow[] {
  const windowDays = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / DAY_MS));

  const paymentsByRental = new Map<string, RevenuePayment[]>();
  for (const payment of payments) {
    const bucket = paymentsByRental.get(payment.rentalId);
    if (bucket) bucket.push(payment);
    else paymentsByRental.set(payment.rentalId, [payment]);
  }

  const byVehicle = new Map<string, VehicleRevenueRow>();

  for (const rental of rentals) {
    let row = byVehicle.get(rental.vehicleId);
    if (!row) {
      row = {
        vehicleId: rental.vehicleId,
        vehicleName: rental.vehicleName ?? "—",
        plateNumber: rental.plateNumber ?? "—",
        rentalCount: 0,
        rentedDays: 0,
        utilizationPercent: 0,
        quotedTotal: 0,
        collected: 0,
        penalties: 0,
        outstanding: 0,
      };
      byVehicle.set(rental.vehicleId, row);
    }

    row.rentalCount += 1;
    row.rentedDays += rentedDaysInWindow(rental, from, to);
    row.quotedTotal += rental.quotedTotal ?? 0;

    for (const payment of paymentsByRental.get(rental.id) ?? []) {
      if (payment.paymentType === "penalty") row.penalties += payment.amount;
      else if (payment.paymentType === "refund") row.collected -= payment.amount;
      else row.collected += payment.amount;
    }
  }

  return [...byVehicle.values()]
    .map((row) => ({
      ...row,
      rentedDays: row.rentedDays,
      // Overlapping rentals can't happen (the schedule gate forbids them), but
      // clamp anyway so a data anomaly can't render 130% utilization.
      utilizationPercent: Math.min(
        100,
        Math.round((row.rentedDays / windowDays) * 100),
      ),
      quotedTotal: round2(row.quotedTotal),
      collected: round2(row.collected),
      penalties: round2(row.penalties),
      outstanding: round2(
        Math.max(0, row.quotedTotal + row.penalties - row.collected),
      ),
    }))
    .sort((a, b) => b.collected - a.collected || a.plateNumber.localeCompare(b.plateNumber));
}
