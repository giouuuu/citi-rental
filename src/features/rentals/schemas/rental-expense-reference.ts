import type { ResourceField } from "@/features/shared/types/resource";

/**
 * Rentals in expense pickers (Expenses and Finance → Expenses): newest first,
 * "WEB-… · customer · plate · start date", searchable by reference number.
 */
export const RENTAL_EXPENSE_REFERENCE = {
  table: "rental_expense_options",
  labelColumn: "reference_number",
  secondaryColumn: "summary",
  orderBy: { column: "start_at", ascending: false },
} satisfies NonNullable<ResourceField["reference"]>;
