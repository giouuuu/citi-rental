import "server-only";

import { unstable_rethrow } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { describeError } from "@/features/analytics/lib/analytics-error";
import type {
  MaintenanceRecord,
  MaintenanceState,
  ScheduledPlan,
} from "@/features/maintenance/lib/maintenance-schedule";
import { toMoney } from "@/features/shared/lib/money";
import type { ResourceQuery } from "@/features/shared/types/resource";

export type MaintenanceResult<T> = { ok: true; data: T } | { ok: false; message: string };

export type VehicleMaintenance = {
  /** Active plans with their due status. */
  schedule: ScheduledPlan[];
  records: MaintenanceRecord[];
};

const DUE_COLUMNS =
  "id, vehicle_id, plate_number, vehicle_name, vehicle_status, current_odometer, name, interval_km, interval_months, baseline_done_on, baseline_odometer, notes, last_done_on, last_odometer, from_record, next_due_on, next_due_km, days_left, km_left, status";

const reading = (value: unknown) => (value === null || value === undefined ? null : Number(value));

function scheduledFromRow(row: Record<string, unknown>): ScheduledPlan {
  return {
    id: String(row.id),
    vehicleId: String(row.vehicle_id),
    plateNumber: String(row.plate_number ?? ""),
    vehicleName: String(row.vehicle_name ?? ""),
    vehicleStatus: String(row.vehicle_status ?? ""),
    currentOdometer: reading(row.current_odometer),
    name: String(row.name ?? ""),
    intervalKm: reading(row.interval_km),
    intervalMonths: reading(row.interval_months),
    baselineDoneOn: String(row.baseline_done_on),
    baselineOdometer: reading(row.baseline_odometer),
    notes: row.notes ? String(row.notes) : null,
    lastDoneOn: String(row.last_done_on),
    lastOdometer: reading(row.last_odometer),
    fromRecord: Boolean(row.from_record),
    nextDueOn: row.next_due_on ? String(row.next_due_on) : null,
    nextDueKm: reading(row.next_due_km),
    daysLeft: reading(row.days_left),
    kmLeft: reading(row.km_left),
    status: row.status as MaintenanceState,
  };
}

function recordFromRow(row: Record<string, unknown>): MaintenanceRecord {
  return {
    id: String(row.id),
    vehicleId: String(row.vehicle_id),
    planId: row.plan_id ? String(row.plan_id) : null,
    title: String(row.title ?? ""),
    performedOn: String(row.performed_on),
    odometer: reading(row.odometer),
    cost: toMoney(row.cost),
    shopName: row.shop_name ? String(row.shop_name) : null,
    documentNumber: row.document_number ? String(row.document_number) : null,
    paymentMethod: row.payment_method ? String(row.payment_method) : null,
    postedExpense: row.expense_id !== null && row.expense_id !== undefined,
    status: row.status === "void" ? "void" : "recorded",
    notes: row.notes ? String(row.notes) : null,
  };
}

function failure(label: string, error: unknown): { ok: false; message: string } {
  unstable_rethrow(error);
  const detail = describeError(error);
  console.error(`${label} failed: ${detail}`);
  return {
    ok: false,
    message: detail.includes("vehicle_maintenance")
      ? "The maintenance tables are missing. Apply the latest database migration."
      : "Maintenance could not be loaded. Try again in a moment.",
  };
}

/** One car's active plans with their due status, and every service done. */
export async function getVehicleMaintenance(vehicleId: string): Promise<MaintenanceResult<VehicleMaintenance>> {
  try {
    const supabase = await createClient();
    const [schedule, records] = await Promise.all([
      supabase
        .from("vehicle_maintenance_due")
        .select(DUE_COLUMNS)
        .eq("vehicle_id", vehicleId)
        .order("urgency", { ascending: false })
        .order("name", { ascending: true }),
      supabase
        .from("vehicle_maintenance_records")
        .select(
          "id, vehicle_id, plan_id, title, performed_on, odometer, cost, shop_name, document_number, payment_method, expense_id, status, notes",
        )
        .eq("vehicle_id", vehicleId)
        .order("performed_on", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);
    if (schedule.error) throw schedule.error;
    if (records.error) throw records.error;
    return {
      ok: true,
      data: {
        schedule: ((schedule.data ?? []) as Record<string, unknown>[]).map(scheduledFromRow),
        records: ((records.data ?? []) as Record<string, unknown>[]).map(recordFromRow),
      },
    };
  } catch (error) {
    return failure("Vehicle maintenance", error);
  }
}

/**
 * Every service due soon or overdue, most urgent first. Retired (inactive)
 * cars are skipped. Pass `vehicleId` to check one car.
 */
export async function listMaintenanceAlerts({
  vehicleId,
}: { vehicleId?: string } = {}): Promise<MaintenanceResult<ScheduledPlan[]>> {
  try {
    const supabase = await createClient();
    let request = supabase
      .from("vehicle_maintenance_due")
      .select(DUE_COLUMNS)
      .neq("status", "on_schedule")
      .neq("vehicle_status", "inactive");
    if (vehicleId) request = request.eq("vehicle_id", vehicleId);
    const { data, error } = await request
      .order("urgency", { ascending: false })
      .order("plate_number", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw error;
    return { ok: true, data: ((data ?? []) as Record<string, unknown>[]).map(scheduledFromRow) };
  } catch (error) {
    return failure("Maintenance alerts", error);
  }
}

export type MaintenanceSchedulePage = {
  rows: ScheduledPlan[];
  page: number;
  pageSize: number;
  hasNextPage: boolean;
};

/**
 * One page of the fleet's service schedule (active cars). Search matches the
 * plate, car name or service; `status` narrows to one due state.
 */
export async function listMaintenanceSchedule(
  query: ResourceQuery,
): Promise<MaintenanceResult<MaintenanceSchedulePage>> {
  try {
    const supabase = await createClient();
    const from = (query.page - 1) * query.pageSize;
    let request = supabase.from("vehicle_maintenance_due").select(DUE_COLUMNS).neq("vehicle_status", "inactive");
    if (query.q) request = request.ilike("search_text", `%${query.q}%`);
    const status = query.filters?.status;
    if (status) request = request.eq("status", status);
    const vehicle = query.filters?.vehicle;
    if (vehicle) request = request.eq("vehicle_id", vehicle);

    const { data, error } = await request
      .order(query.sort, { ascending: query.direction === "asc" })
      // Within a status, the nearest due date first.
      .order("next_due_on", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, from + query.pageSize);
    if (error) throw error;
    const rows = ((data ?? []) as Record<string, unknown>[]).map(scheduledFromRow);
    return {
      ok: true,
      data: {
        rows: rows.slice(0, query.pageSize),
        page: query.page,
        pageSize: query.pageSize,
        hasNextPage: rows.length > query.pageSize,
      },
    };
  } catch (error) {
    return failure("Maintenance schedule", error);
  }
}
