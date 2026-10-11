import { z } from "zod";

import { optionalNumber, requiredText } from "@/features/shared/schemas/schema-helpers";
import type { ResourceDefinition } from "@/features/shared/types/resource";

export const vehicleExpenseCategoryDefinition: ResourceDefinition = {
  key: "expense-category",
  table: "vehicle_expense_categories",
  singular: "Expense category",
  plural: "Expense categories",
  route: "/expenses/categories",
  parent: { label: "Expenses", href: "/expenses" },
  titleField: "name",
  searchColumn: "name",
  description: "The categories staff pick from when they record what a car cost, such as car wash, fuel or tires.",
  writeRoles: ["owner", "admin"],
  // Archived categories stay on past expenses; they just leave the expense form.
  archive: { field: "is_active", value: false, label: "Archive category" },
  filters: [
    {
      param: "active",
      column: "is_active",
      op: "eq",
      label: "Status",
      picker: true,
      valueLabels: { true: "Active", false: "Archived" },
    },
  ],
  schema: z.object({
    name: requiredText("Name", 80),
    sort_order: optionalNumber(0).pipe(z.number().int().max(9999).optional()),
    is_active: z.boolean(),
  }),
  fields: [
    { name: "name", label: "Name", required: true, placeholder: "Car wash" },
    {
      name: "sort_order",
      label: "Order in the list",
      type: "number",
      step: "1",
      description: "Lower numbers show first.",
    },
    {
      name: "is_active",
      label: "Active",
      type: "checkbox",
      description: "Untick to hide it from new expenses. Past expenses keep it.",
      className: "md:col-span-2",
    },
  ],
  columns: [
    { key: "name", label: "Category" },
    { key: "sort_order", label: "Order", format: "number" },
    { key: "is_active", label: "Active", format: "boolean" },
    { key: "updated_at", label: "Last updated", format: "datetime" },
  ],
  demoRows: [
    { id: "demo-vehicle-category-wash", name: "Car wash", sort_order: 10, is_active: true, updated_at: "2026-10-11T02:00:00Z" },
    { id: "demo-vehicle-category-fuel", name: "Fuel", sort_order: 20, is_active: true, updated_at: "2026-10-11T02:00:00Z" },
  ],
};
