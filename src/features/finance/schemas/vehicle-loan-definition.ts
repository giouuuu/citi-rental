import { z } from "zod";

import { optionalText, requiredNumber, requiredText } from "@/features/shared/schemas/schema-helpers";
import type { ResourceDefinition } from "@/features/shared/types/resource";
import { requiredDate } from "@/features/finance/schemas/finance-schema-helpers";

const INTEREST_METHOD_VALUES = ["effective", "straight_line"] as const;
const STATUS_VALUES = ["active", "paid_off", "closed"] as const;

export const LOAN_STATUS_LABELS: Record<(typeof STATUS_VALUES)[number], string> = {
  active: "Active",
  paid_off: "Paid off",
  closed: "Closed",
};

/**
 * A car loan entered from the bank's disclosure statement. It is edited from
 * the vehicle page (Financing tab), so `route` points back there.
 */
export const vehicleLoanDefinition: ResourceDefinition = {
  key: "vehicle-loan",
  table: "vehicle_loans",
  singular: "Car loan",
  plural: "Car loans",
  route: "/vehicles",
  titleField: "lender_name",
  searchColumn: "lender_name",
  description: "Monthly amortization on a fleet unit. Only the interest part of each payment is an expense.",
  writeRoles: ["owner"],
  schema: z
    .object({
      vehicle_id: z.uuid("Select a vehicle."),
      lender_name: requiredText("Lender", 200),
      account_number: optionalText(80),
      amount_financed: requiredNumber("Amount financed", 0.01),
      monthly_amortization: requiredNumber("Monthly amortization", 0.01),
      term_months: z.coerce
        .number()
        .int("Use whole months.")
        .min(1, "The term must be at least one month.")
        .max(120, "The term cannot exceed 120 months."),
      first_due_date: requiredDate("First due date"),
      installments_paid_before: z.coerce.number().int("Use a whole number.").min(0).default(0),
      interest_method: z.enum(INTEREST_METHOD_VALUES),
      status: z.enum(STATUS_VALUES).default("active"),
      notes: optionalText(),
    })
    .refine((value) => value.monthly_amortization * value.term_months >= value.amount_financed, {
      message: "Amortization × term must at least cover the amount financed.",
      path: ["monthly_amortization"],
    })
    .refine((value) => value.installments_paid_before < value.term_months, {
      message: "Must be fewer than the number of months.",
      path: ["installments_paid_before"],
    }),
  fields: [
    { name: "vehicle_id", label: "Vehicle", required: true },
    { name: "lender_name", label: "Lender", required: true, placeholder: "BDO Auto Loans" },
    { name: "account_number", label: "Loan account number" },
    {
      name: "amount_financed",
      label: "Amount financed (PHP)",
      type: "number",
      step: "0.01",
      required: true,
      description: "Car price minus your down payment: the principal you owe the bank.",
    },
    {
      name: "monthly_amortization",
      label: "Monthly amortization (PHP)",
      type: "number",
      step: "0.01",
      required: true,
      description: "The fixed amount you pay each month.",
    },
    { name: "term_months", label: "Number of months", type: "number", step: "1", required: true, placeholder: "48" },
    { name: "first_due_date", label: "First due date", type: "date", required: true },
    {
      name: "installments_paid_before",
      label: "Months already paid",
      type: "number",
      step: "1",
      description: "Paid before you started tracking here. They lower the balance but post no expense.",
    },
    {
      name: "interest_method",
      label: "Interest split",
      type: "select",
      required: true,
      options: [
        { value: "effective", label: "Declining balance (like the bank's schedule)" },
        { value: "straight_line", label: "Equal interest every month" },
      ],
      description: "How each payment divides into interest and principal. You can still adjust each payment.",
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      required: true,
      options: STATUS_VALUES.map((value) => ({ value, label: LOAN_STATUS_LABELS[value] })),
      description: "Close a loan that was refinanced or settled early.",
    },
    { name: "notes", label: "Notes", type: "textarea", className: "md:col-span-2" },
  ],
  columns: [
    { key: "lender_name", label: "Lender" },
    { key: "amount_financed", label: "Financed", format: "money" },
    { key: "monthly_amortization", label: "Monthly", format: "money" },
    { key: "status", label: "Status", format: "status" },
  ],
};
