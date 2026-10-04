import { z } from "zod";

import {
  optionalNumber,
  optionalText,
  requiredNumber,
  requiredText,
} from "@/features/shared/schemas/schema-helpers";
import type { ResourceDefinition } from "@/features/shared/types/resource";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_OPTIONS,
} from "@/features/vehicle-costs/lib/expense-categories";

export const vehicleExpenseDefinition: ResourceDefinition = {
  key: "expense",
  table: "vehicle_expenses",
  singular: "Expense",
  plural: "Expenses",
  route: "/expenses",
  // Vendor reads well as the detail title ("Rapide Cebu"); when it's empty the
  // shared screens fall back to the singular label, never a raw enum slug.
  titleField: "vendor",
  subtitleField: "reference",
  searchColumn: "vendor",
  description:
    "Record every peso a vehicle costs — wash, fuel, repairs, registration, insurance — so profitability reports stay honest.",
  writeRoles: ["owner", "admin", "staff"],
  // The action behind this button hard-deletes the row (expenses have no
  // status lifecycle); the field/value here are unused, only the label is.
  archive: { field: "id", value: null, label: "Delete expense" },
  // `receipt` is a file input, not a column — list what the detail query
  // should actually select.
  detailColumns: [
    "id",
    "vehicle_id",
    "category",
    "amount",
    "incurred_on",
    "odometer_km",
    "vendor",
    "reference",
    "receipt_path",
    "notes",
  ],
  schema: z.object({
    vehicle_id: z.uuid("Select a vehicle."),
    category: z.enum(EXPENSE_CATEGORIES),
    amount: requiredNumber("Amount", 0.01),
    incurred_on: requiredText("Date", 40),
    odometer_km: optionalNumber(0),
    vendor: optionalText(120),
    reference: optionalText(120),
    notes: optionalText(4000),
  }),
  fields: [
    {
      name: "vehicle_id",
      label: "Vehicle",
      type: "select",
      required: true,
      reference: {
        table: "vehicles",
        labelColumn: "plate_number",
        secondaryColumn: "name",
      },
    },
    {
      name: "category",
      label: "Category",
      type: "select",
      required: true,
      options: EXPENSE_CATEGORY_OPTIONS,
    },
    {
      name: "amount",
      label: "Amount (PHP)",
      type: "number",
      step: "0.01",
      required: true,
    },
    {
      name: "incurred_on",
      label: "Date",
      type: "date",
      required: true,
    },
    {
      name: "vendor",
      label: "Vendor / shop",
      placeholder: "Rapide Cebu",
    },
    {
      name: "reference",
      label: "Receipt / OR number",
    },
    {
      name: "odometer_km",
      label: "Odometer (km)",
      type: "number",
      step: "0.1",
      description: "Reading at the time of the expense, if known.",
    },
    {
      name: "receipt",
      label: "Receipt photo",
      type: "image",
      description: "JPEG, PNG, WebP, or GIF up to 5MB. Stored privately.",
    },
    {
      name: "notes",
      label: "Notes",
      type: "textarea",
      className: "md:col-span-2",
    },
  ],
  columns: [
    { key: "incurred_on", label: "Date", format: "date" },
    { key: "category", label: "Category", format: "status" },
    { key: "amount", label: "Amount", format: "number" },
    { key: "vendor", label: "Vendor" },
    { key: "reference", label: "Reference" },
  ],
  demoRows: [
    {
      id: "demo-expense",
      vehicle_id: "demo-vehicle",
      category: "repair",
      amount: 6400,
      incurred_on: "2026-08-05",
      vendor: "Aircon specialist",
      reference: "OR-10231",
    },
  ],
};
