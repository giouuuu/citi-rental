/**
 * Maintenance types and wording. Due status itself is computed in one place,
 * the `vehicle_maintenance_due` view (migration 20261006090000), because the
 * Vehicles list and the fleet Maintenance page sort and filter by it.
 */

export type MaintenanceState = "overdue" | "due_soon" | "on_schedule";

export type MaintenancePlan = {
  id: string;
  vehicleId: string;
  name: string;
  intervalKm: number | null;
  intervalMonths: number | null;
  /** When the work was last done before the plan was entered. */
  baselineDoneOn: string;
  baselineOdometer: number | null;
  notes: string | null;
};

/** An active plan with its due point, as `vehicle_maintenance_due` computes it. */
export type ScheduledPlan = MaintenancePlan & {
  plateNumber: string;
  vehicleName: string;
  vehicleStatus: string;
  currentOdometer: number | null;
  lastDoneOn: string;
  lastOdometer: number | null;
  /** False while the plan still counts from its starting point. */
  fromRecord: boolean;
  nextDueOn: string | null;
  nextDueKm: number | null;
  /** Negative once the date has passed; null for a km-only plan. */
  daysLeft: number | null;
  /** Negative once the reading has passed; null without a km interval or odometer. */
  kmLeft: number | null;
  status: MaintenanceState;
};

export type MaintenanceRecord = {
  id: string;
  vehicleId: string;
  planId: string | null;
  title: string;
  performedOn: string;
  odometer: number | null;
  cost: number;
  shopName: string | null;
  documentNumber: string | null;
  paymentMethod: string | null;
  /** True when the cost was posted to the expense ledger. */
  postedExpense: boolean;
  status: "recorded" | "void";
  notes: string | null;
};

export const MAINTENANCE_STATE_LABELS: Record<MaintenanceState, string> = {
  overdue: "Overdue",
  due_soon: "Due soon",
  on_schedule: "On schedule",
};

/** The schedules most fleets start with. Intervals stay editable per car. */
export const MAINTENANCE_PRESETS: { name: string; intervalKm: number | null; intervalMonths: number | null }[] = [
  { name: "Oil change", intervalKm: 10_000, intervalMonths: null },
  { name: "Aircon cleaning", intervalKm: null, intervalMonths: 6 },
  { name: "PMS", intervalKm: null, intervalMonths: 12 },
];

const km = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 });

export function formatKm(value: number) {
  return `${km.format(value)} km`;
}

function months(count: number) {
  if (count % 12 === 0) return count === 12 ? "year" : `${count / 12} years`;
  return count === 1 ? "month" : `${count} months`;
}

/** "Every 10,000 km or 6 months, whichever comes first". */
export function describeInterval(plan: Pick<MaintenancePlan, "intervalKm" | "intervalMonths">): string {
  const parts = [
    plan.intervalKm ? formatKm(plan.intervalKm) : null,
    plan.intervalMonths ? months(plan.intervalMonths) : null,
  ].filter(Boolean);
  return parts.length === 2 ? `Every ${parts[0]} or ${parts[1]}, whichever comes first` : `Every ${parts[0]}`;
}

function days(count: number) {
  return count === 1 ? "1 day" : `${count} days`;
}

/** The nearer of the two limits, in words: "Overdue by 1,200 km", "Due in 12 days". */
export function describeDue(due: Pick<ScheduledPlan, "daysLeft" | "kmLeft">): string {
  const { daysLeft, kmLeft } = due;
  if (kmLeft !== null && kmLeft <= 0) return kmLeft === 0 ? "Due now" : `Overdue by ${formatKm(-kmLeft)}`;
  if (daysLeft !== null && daysLeft < 0) return `Overdue by ${days(-daysLeft)}`;
  if (daysLeft === 0) return "Due today";
  const parts = [kmLeft !== null ? formatKm(kmLeft) : null, daysLeft !== null ? days(daysLeft) : null].filter(Boolean);
  return parts.length > 0 ? `Due in ${parts.join(" or ")}` : "Needs an odometer reading";
}

/** "40,150 km or Jul 10, 2026": the next due point(s), unformatted dates left to the caller. */
export function nextDueParts(plan: Pick<ScheduledPlan, "nextDueKm" | "nextDueOn">, formatDate: (key: string) => string) {
  return [plan.nextDueKm !== null ? formatKm(plan.nextDueKm) : null, plan.nextDueOn ? formatDate(plan.nextDueOn) : null]
    .filter(Boolean)
    .join(" or ");
}
