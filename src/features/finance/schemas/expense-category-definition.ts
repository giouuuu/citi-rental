import { z } from "zod";

import { optionalNumber, optionalText, requiredText } from "@/features/shared/schemas/schema-helpers";
import type { ResourceDefinition } from "@/features/shared/types/resource";

export const expenseCategoryDefinition: ResourceDefinition = {
  key: "expense-category",
  table: "expense_categories",
  singular: "Expense category",
  plural: "Expense categories",
  route: "/finance/categories",
  parent: { label: "Finance", href: "/finance" },
  titleField: "name",
  subtitleField: "bir_line",
  searchColumn: "name",
  description:
    "The categories an expense is filed under, and the BIR itemized-deduction line each one rolls up to on the accountant report.",
  writeRoles: ["owner"],
  // Archived categories stay on past expenses; they just leave the expense picker.
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
    name: requiredText("Name", 120),
    bir_line: optionalText(160),
    description: optionalText(500),
    default_ewt_percent: optionalNumber(0).pipe(z.number().max(100, "EWT rate cannot exceed 100%.").optional()),
    sort_order: optionalNumber(0).pipe(z.number().int().max(9999).optional()),
    is_active: z.boolean(),
  }),
  fields: [
    { name: "name", label: "Name", required: true, placeholder: "Car wash" },
    {
      name: "bir_line",
      label: "BIR deduction line",
      placeholder: "Janitorial and messengerial services",
      description:
        "The line on the BIR Schedule of Itemized Deductions it rolls up to. Leave blank to use the name.",
    },
    {
      name: "description",
      label: "What goes here",
      type: "textarea",
      className: "md:col-span-2",
    },
    {
      name: "default_ewt_percent",
      label: "Usual EWT rate (%)",
      type: "number",
      step: "0.01",
      description: "A hint: the report flags expenses here that skip withholding. Leave blank if none.",
    },
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
    { key: "bir_line", label: "BIR line" },
    { key: "default_ewt_percent", label: "Usual EWT %", format: "number" },
    { key: "sort_order", label: "Order", format: "number" },
    { key: "is_active", label: "Active", format: "boolean" },
    { key: "updated_at", label: "Last updated", format: "datetime" },
  ],
  demoRows: [
    { id: "demo-category-fuel", name: "Fuel and oil", bir_line: "Fuel and oil", default_ewt_percent: null, sort_order: 10, is_active: true, updated_at: "2026-10-05T02:00:00Z" },
    { id: "demo-category-rental", name: "Rental", bir_line: "Rental", default_ewt_percent: 5, sort_order: 60, is_active: true, updated_at: "2026-10-05T02:00:00Z" },
  ],
};
