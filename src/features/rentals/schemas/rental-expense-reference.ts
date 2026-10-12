import type { ResourceField } from "@/features/shared/types/resource";

/**
 * Rentals in expense pickers (Expenses and Finance → Expenses): newest first,
 * "WEB-… · customer · plate · start date", searchable by reference number.
 * Picking one sets the form's Vehicle to the rental's car.
 */
export const RENTAL_EXPENSE_REFERENCE = {
  table: "rental_expense_options",
  labelColumn: "reference_number",
  secondaryColumn: "summary",
  orderBy: { column: "start_at", ascending: false },
  fills: { vehicle_id: "vehicle_id" },
} satisfies NonNullable<ResourceField["reference"]>;

/** Lock for a Vehicle field while a rental is picked: the rental decides the car. */
export const VEHICLE_FROM_RENTAL_LOCK = {
  field: "rental_id",
  whenSet: true,
  message: "Set by the rental. Clear Rental to pick another car.",
} satisfies NonNullable<ResourceField["lockWhen"]>;
