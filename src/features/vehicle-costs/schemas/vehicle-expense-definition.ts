import { z } from "zod";

import {
  optionalNumber,
  optionalText,
  optionalUuid,
  requiredNumber,
  requiredText,
} from "@/features/shared/schemas/schema-helpers";
import type { ResourceDefinition } from "@/features/shared/types/resource";
import {
  RENTAL_EXPENSE_REFERENCE,
  VEHICLE_FROM_RENTAL_LOCK,
} from "@/features/rentals/schemas/rental-expense-reference";

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
    "rental_id",
    "vehicle_id",
    "category_id",
    "amount",
    "incurred_on",
    "odometer_km",
    "vendor",
    "reference",
    "receipt_path",
    "notes",
  ],
  schema: z
    .object({
      rental_id: optionalUuid,
      vehicle_id: optionalUuid,
      category_id: z.uuid("Select a category."),
      amount: requiredNumber("Amount", 0.01),
      incurred_on: requiredText("Date", 40),
      odometer_km: optionalNumber(0),
      vendor: optionalText(120),
      reference: optionalText(120),
      notes: optionalText(4000),
    })
    .refine((value) => value.vehicle_id || value.rental_id, {
      message: "Select a vehicle, or pick the rental it was for.",
      path: ["vehicle_id"],
    }),
  // What was paid first: most costs (fuel, repairs) are for no booking.
  fields: [
    {
      name: "category_id",
      label: "Category",
      type: "select",
      required: true,
      reference: {
        table: "vehicle_expense_categories",
        labelColumn: "name",
        activeColumn: "is_active",
      },
      description: "Missing one? Add it under Expenses → Categories.",
      section: { title: "What was paid" },
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
      name: "rental_id",
      label: "Rental",
      type: "select",
      reference: RENTAL_EXPENSE_REFERENCE,
      description: "Optional. Search by reference number or customer.",
      section: {
        title: "What it was for",
        description:
          "Pick the booking when this paid for its car wash or delivery. It also goes to Finance against that booking, so don't enter it there again.",
      },
    },
    {
      name: "vehicle_id",
      label: "Vehicle",
      type: "select",
      reference: {
        table: "vehicles",
        labelColumn: "plate_number",
        secondaryColumn: "name",
      },
      description: "Needed when there's no rental.",
      lockWhen: VEHICLE_FROM_RENTAL_LOCK,
    },
    {
      name: "reference",
      label: "Receipt / OR number",
      section: { title: "Proof" },
    },
    {
      name: "odometer_km",
      label: "Odometer (km)",
      type: "number",
      step: "0.1",
      description: "If known.",
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
    },
  ],
  filters: [
    {
      param: "rental",
      column: "rental_id",
      op: "eq",
      label: "Rental",
      picker: true,
      reference: RENTAL_EXPENSE_REFERENCE,
    },
    {
      param: "category",
      column: "category_id",
      op: "eq",
      label: "Category",
      picker: true,
      reference: { table: "vehicle_expense_categories", labelColumn: "name" },
    },
  ],
  columns: [
    { key: "incurred_on", label: "Date", format: "date" },
    {
      key: "category_name",
      label: "Category",
      reference: { table: "vehicle_expense_categories", column: "name" },
    },
    { key: "amount", label: "Amount", format: "number" },
    { key: "vendor", label: "Vendor" },
    { key: "reference", label: "Reference" },
    {
      key: "rental_reference",
      label: "Rental",
      reference: { table: "rentals", column: "reference_number" },
    },
  ],
  demoRows: [
    {
      id: "demo-expense",
      vehicle_id: "demo-vehicle",
      category_name: "Repair",
      amount: 6400,
      incurred_on: "2026-08-05",
      vendor: "Aircon specialist",
      reference: "OR-10231",
    },
  ],
};
