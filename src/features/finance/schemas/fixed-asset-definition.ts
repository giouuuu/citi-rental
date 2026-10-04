import { z } from "zod";

import {
  optionalNumber,
  optionalText,
  optionalUuid,
  requiredNumber,
  requiredText,
} from "@/features/shared/schemas/schema-helpers";
import type { ResourceDefinition } from "@/features/shared/types/resource";
import { optionalDate, requiredDate } from "@/features/finance/schemas/finance-schema-helpers";

const ASSET_CLASS_VALUES = ["vehicle", "equipment", "furniture", "leasehold_improvement", "other"] as const;
const METHOD_VALUES = ["straight_line", "declining_balance", "sum_of_years_digits"] as const;

export const DEPRECIATION_METHOD_LABELS: Record<(typeof METHOD_VALUES)[number], string> = {
  straight_line: "Straight-line",
  declining_balance: "Double-declining balance",
  sum_of_years_digits: "Sum-of-years-digits",
};

export const fixedAssetDefinition: ResourceDefinition = {
  key: "fixed-asset",
  // The labelled view for reads; writes go to `fixed_assets`.
  table: "fixed_asset_register",
  singular: "Fixed asset",
  plural: "Fixed assets",
  route: "/finance/assets",
  parent: { label: "Finance", href: "/finance" },
  titleField: "name",
  subtitleField: "vehicle_plate",
  searchColumn: "name",
  description:
    "The register that depreciation is computed from. Every fleet unit needs its acquisition cost here, or its largest deduction goes missing.",
  writeRoles: ["owner"],
  filters: [{ param: "status", column: "status", op: "eq", label: "Status", showValue: true }],
  schema: z
    .object({
      name: requiredText("Asset name", 160),
      asset_class: z.enum(ASSET_CLASS_VALUES),
      vehicle_id: optionalUuid,
      acquisition_date: requiredDate("Acquisition date"),
      acquisition_cost: requiredNumber("Acquisition cost", 0.01),
      salvage_value: optionalNumber(0).default(0),
      useful_life_months: z.coerce
        .number()
        .int("Use whole months.")
        .min(1, "Useful life must be at least one month.")
        .max(600),
      depreciation_method: z.enum(METHOD_VALUES),
      supplier_name: optionalText(200),
      document_number: optionalText(80),
      disposed_on: optionalDate,
      disposal_proceeds: optionalNumber(0),
      notes: optionalText(),
    })
    .refine((value) => value.salvage_value < value.acquisition_cost, {
      message: "Salvage value must be below the acquisition cost.",
      path: ["salvage_value"],
    })
    .refine(
      (value) => value.depreciation_method === "straight_line" || value.useful_life_months % 12 === 0,
      {
        message: "Accelerated methods need a life in whole years (a multiple of 12 months).",
        path: ["useful_life_months"],
      },
    )
    .refine((value) => !value.disposed_on || value.disposed_on >= value.acquisition_date, {
      message: "Disposal cannot be before acquisition.",
      path: ["disposed_on"],
    }),
  fields: [
    { name: "name", label: "Asset name", required: true, placeholder: "Toyota Vios 1.3 XLE — AAA 111" },
    {
      name: "asset_class",
      label: "Class",
      type: "select",
      required: true,
      options: [
        { value: "vehicle", label: "Vehicle" },
        { value: "equipment", label: "Equipment" },
        { value: "furniture", label: "Furniture and fixtures" },
        { value: "leasehold_improvement", label: "Leasehold improvement" },
        { value: "other", label: "Other" },
      ],
    },
    {
      name: "vehicle_id",
      label: "Fleet vehicle",
      type: "select",
      reference: { table: "vehicles", labelColumn: "plate_number", secondaryColumn: "name" },
      description: "Links the unit so its depreciation counts against its own margin.",
    },
    { name: "acquisition_date", label: "Acquisition date", type: "date", required: true },
    {
      name: "acquisition_cost",
      label: "Acquisition cost (PHP)",
      type: "number",
      step: "0.01",
      required: true,
      description: "Purchase price plus costs to put it in service (registration, accessories). Net of creditable VAT.",
    },
    {
      name: "salvage_value",
      label: "Salvage value (PHP)",
      type: "number",
      step: "0.01",
      description: "Expected resale value at the end of its useful life.",
    },
    {
      name: "useful_life_months",
      label: "Useful life (months)",
      type: "number",
      step: "1",
      required: true,
      description: "60 months is five years.",
    },
    {
      name: "depreciation_method",
      label: "Method",
      type: "select",
      required: true,
      options: METHOD_VALUES.map((value) => ({ value, label: DEPRECIATION_METHOD_LABELS[value] })),
      description: "Straight-line is the default; NIRC s.34(F) also allows the accelerated methods.",
    },
    { name: "supplier_name", label: "Bought from" },
    { name: "document_number", label: "Invoice / deed number" },
    {
      name: "disposed_on",
      label: "Disposed on",
      type: "date",
      description: "Depreciation stops after this month.",
    },
    { name: "disposal_proceeds", label: "Disposal proceeds (PHP)", type: "number", step: "0.01" },
    { name: "notes", label: "Notes", type: "textarea", className: "md:col-span-2" },
  ],
  detailColumns: [
    "name",
    "asset_class",
    "vehicle_id",
    "acquisition_date",
    "acquisition_cost",
    "salvage_value",
    "useful_life_months",
    "depreciation_method",
    "supplier_name",
    "document_number",
    "disposed_on",
    "disposal_proceeds",
    "notes",
    "vehicle_plate",
    "status",
  ],
  columns: [
    { key: "name", label: "Asset" },
    { key: "vehicle_plate", label: "Vehicle" },
    { key: "acquisition_date", label: "Acquired", format: "date" },
    { key: "acquisition_cost", label: "Cost", format: "money" },
    { key: "useful_life_months", label: "Life (months)", format: "number" },
    { key: "depreciation_method", label: "Method" },
    { key: "status", label: "Status", format: "status" },
  ],
};
