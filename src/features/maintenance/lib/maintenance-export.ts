import {
  describeDue,
  describeInterval,
  MAINTENANCE_STATE_LABELS,
  nextDueParts,
  type ScheduledPlan,
} from "@/features/maintenance/lib/maintenance-schedule";
import { formatDateKey } from "@/features/shared/lib/manila-time";
import type { XlsxColumn } from "@/features/shared/lib/to-xlsx";

/** The service-schedule table as spreadsheet columns, in the order it shows them. */
export const SCHEDULE_XLSX_COLUMNS: XlsxColumn[] = [
  { key: "status", header: "Status" },
  { key: "plate", header: "Plate" },
  { key: "car", header: "Car" },
  { key: "service", header: "Service" },
  { key: "interval", header: "Interval" },
  { key: "lastDoneOn", header: "Last done", format: "date" },
  { key: "lastOdometer", header: "Last done (km)", format: "number" },
  { key: "nextDue", header: "Next due" },
  { key: "dueIn", header: "Due in" },
];

export function scheduleXlsxRows(plans: ScheduledPlan[], includeCar = true): Record<string, unknown>[] {
  return plans.map((plan) => ({
    status: MAINTENANCE_STATE_LABELS[plan.status],
    plate: includeCar ? plan.plateNumber : undefined,
    car: includeCar ? plan.vehicleName : undefined,
    service: plan.name,
    interval: describeInterval(plan),
    lastDoneOn: plan.lastDoneOn,
    lastOdometer: plan.lastOdometer,
    nextDue: nextDueParts(plan, (key) => formatDateKey(key)),
    dueIn: describeDue(plan),
  }));
}
