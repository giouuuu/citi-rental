/**
 * Fixed expense category list, mirroring public.vehicle_expense_category.
 * Deliberately an enum, not an org-editable table — promote only when a real
 * thirteenth category shows up.
 */
export const EXPENSE_CATEGORIES = [
  "car_wash",
  "fuel",
  "repair",
  "maintenance",
  "tires",
  "battery",
  "registration",
  "insurance",
  "towing",
  "parking_tolls",
  "accessories",
  "other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  car_wash: "Car wash",
  fuel: "Fuel",
  repair: "Repair",
  maintenance: "Maintenance",
  tires: "Tires",
  battery: "Battery",
  registration: "Registration (LTO)",
  insurance: "Insurance",
  towing: "Towing",
  parking_tolls: "Parking & tolls",
  accessories: "Accessories",
  other: "Other",
};

export const EXPENSE_CATEGORY_OPTIONS = EXPENSE_CATEGORIES.map((value) => ({
  value,
  label: EXPENSE_CATEGORY_LABELS[value],
}));

export function expenseCategoryLabel(value: string): string {
  return EXPENSE_CATEGORY_LABELS[value as ExpenseCategory] ?? value;
}
