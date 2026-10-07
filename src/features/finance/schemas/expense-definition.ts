import { z } from "zod";

import {
  optionalNumber,
  optionalText,
  optionalUuid,
  requiredNumber,
  requiredText,
} from "@/features/shared/schemas/schema-helpers";
import type { ResourceDefinition } from "@/features/shared/types/resource";
import { optionalTin, requiredDate } from "@/features/finance/schemas/finance-schema-helpers";

const DOCUMENT_TYPE_VALUES = [
  "vat_invoice",
  "non_vat_invoice",
  "official_receipt",
  "acknowledgement_receipt",
  "payroll",
  "none",
] as const;

const PAYMENT_METHOD_VALUES = ["cash", "bank", "gcash", "maya", "check", "other"] as const;

export const DOCUMENT_TYPES: { value: (typeof DOCUMENT_TYPE_VALUES)[number]; label: string }[] = [
  { value: "vat_invoice", label: "VAT invoice" },
  { value: "non_vat_invoice", label: "Non-VAT invoice" },
  { value: "official_receipt", label: "Official receipt (pre-EOPT)" },
  { value: "acknowledgement_receipt", label: "Acknowledgement receipt" },
  { value: "payroll", label: "Payroll record" },
  { value: "none", label: "No document" },
];

export const PAYMENT_METHODS: { value: (typeof PAYMENT_METHOD_VALUES)[number]; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank transfer" },
  { value: "gcash", label: "GCash" },
  { value: "maya", label: "Maya" },
  { value: "check", label: "Check" },
  { value: "other", label: "Other" },
];

const lockedUnlessWithholding = {
  field: "withholding_required",
  values: ["false", ""],
  message: "Tick “Expanded withholding tax applies” first.",
};

export const expenseDefinition: ResourceDefinition = {
  key: "expense",
  // The labelled view for reads; writes go to `expenses`.
  table: "expense_ledger",
  singular: "Expense",
  plural: "Expenses",
  route: "/finance/expenses",
  parent: { label: "Finance", href: "/finance" },
  titleField: "description",
  subtitleField: "category_name",
  searchColumn: "description",
  description:
    "Every business cost, filed under the BIR itemized-deduction line it belongs to, with the invoice and withholding details an audit asks for.",
  writeRoles: ["owner"],
  archive: { field: "status", value: "void", label: "Void expense" },
  filters: [
    {
      param: "category",
      column: "category_id",
      op: "eq",
      label: "Deduction line",
      picker: true,
      reference: { table: "expense_categories", labelColumn: "name" },
    },
    {
      param: "vehicle",
      column: "vehicle_id",
      op: "eq",
      label: "Car",
      picker: true,
      reference: { table: "vehicles", labelColumn: "plate_number", secondaryColumn: "name" },
    },
    { param: "from", column: "expense_date", op: "gte", label: "From", showValue: true },
    { param: "to", column: "expense_date", op: "lte", label: "To", showValue: true },
    {
      param: "status",
      column: "status",
      op: "eq",
      label: "Status",
      picker: true,
      valueLabels: { recorded: "Recorded", void: "Void" },
    },
  ],
  schema: z
    .object({
      expense_date: requiredDate("Expense date"),
      category_id: z.uuid("Select the BIR line."),
      description: requiredText("Description", 300),
      gross_amount: requiredNumber("Amount paid", 0.01),
      input_vat: optionalNumber(0).default(0),
      vehicle_id: optionalUuid,
      supplier_name: optionalText(200),
      supplier_tin: optionalTin,
      supplier_vat_registered: z.boolean(),
      document_type: z.enum(DOCUMENT_TYPE_VALUES),
      document_number: optionalText(80),
      payment_method: z.enum(PAYMENT_METHOD_VALUES).optional(),
      withholding_required: z.boolean(),
      ewt_percent: z.coerce.number().min(0).max(100, "EWT rate cannot exceed 100%.").optional(),
      ewt_remitted: z.boolean(),
      status: z.enum(["recorded", "void"]).default("recorded"),
      notes: optionalText(),
    })
    .refine((value) => value.input_vat < value.gross_amount, {
      message: "Input VAT must be less than the amount paid.",
      path: ["input_vat"],
    })
    .refine((value) => !value.withholding_required || value.ewt_percent !== undefined, {
      message: "Enter the EWT rate that applies.",
      path: ["ewt_percent"],
    }),
  fields: [
    { name: "expense_date", label: "Expense date", type: "date", required: true },
    {
      name: "category_id",
      label: "BIR deduction line",
      type: "select",
      required: true,
      reference: {
        table: "expense_categories",
        labelColumn: "name",
        activeColumn: "is_active",
      },
      description: "Depreciation is not entered here; it comes from the fixed-asset register.",
    },
    {
      name: "description",
      label: "Description",
      required: true,
      placeholder: "PMS 10,000 km — AAA 111",
      className: "md:col-span-2",
    },
    {
      name: "gross_amount",
      label: "Amount paid (VAT included)",
      type: "number",
      step: "0.01",
      required: true,
    },
    {
      name: "input_vat",
      label: "Input VAT on the invoice",
      type: "number",
      step: "0.01",
      description: "The VAT line printed on the invoice. Leave 0 when there is none.",
    },
    {
      name: "vehicle_id",
      label: "Vehicle",
      type: "select",
      reference: { table: "vehicles", labelColumn: "plate_number", secondaryColumn: "name" },
      description: "Optional. Tags the cost to one unit for per-vehicle margin.",
    },
    {
      name: "payment_method",
      label: "Paid by",
      type: "select",
      options: PAYMENT_METHODS,
    },
    { name: "supplier_name", label: "Supplier" },
    { name: "supplier_tin", label: "Supplier TIN", placeholder: "000-000-000-00000" },
    {
      name: "supplier_vat_registered",
      label: "Supplier is VAT-registered",
      type: "checkbox",
      description: "Only VAT from a VAT-registered supplier's VAT invoice is creditable.",
      className: "md:col-span-2",
    },
    {
      name: "document_type",
      label: "Supporting document",
      type: "select",
      required: true,
      options: DOCUMENT_TYPES,
    },
    { name: "document_number", label: "Document number", placeholder: "SI-000123" },
    {
      name: "withholding_required",
      label: "Expanded withholding tax applies",
      type: "checkbox",
      description: "Rent, professional fees and contractors usually require EWT (0619E / 1601EQ).",
      className: "md:col-span-2",
    },
    {
      name: "ewt_percent",
      label: "EWT rate (%)",
      type: "number",
      step: "0.01",
      description: "Withheld on the amount net of VAT. The peso amount is computed for you.",
      lockWhen: lockedUnlessWithholding,
    },
    {
      name: "ewt_remitted",
      label: "EWT remitted to BIR",
      type: "checkbox",
      description: "Unremitted withholding puts the whole deduction at risk.",
      lockWhen: lockedUnlessWithholding,
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      required: true,
      options: [
        { label: "Recorded", value: "recorded" },
        { label: "Void", value: "void" },
      ],
      description: "Void instead of deleting, so the ledger keeps its history.",
    },
    { name: "notes", label: "Notes", type: "textarea", className: "md:col-span-2" },
  ],
  detailColumns: [
    "expense_date",
    "category_id",
    "description",
    "gross_amount",
    "input_vat",
    "vehicle_id",
    "payment_method",
    "supplier_name",
    "supplier_tin",
    "supplier_vat_registered",
    "document_type",
    "document_number",
    "withholding_required",
    "ewt_percent",
    "ewt_amount",
    "ewt_remitted",
    "status",
    "notes",
    "net_amount",
    "category_name",
  ],
  columns: [
    { key: "expense_date", label: "Date", format: "date" },
    { key: "description", label: "Description" },
    { key: "category_name", label: "BIR line" },
    { key: "vehicle_plate", label: "Vehicle" },
    { key: "gross_amount", label: "Paid", format: "money" },
    { key: "net_amount", label: "Net of VAT", format: "money" },
    { key: "status", label: "Status", format: "status" },
  ],
};
