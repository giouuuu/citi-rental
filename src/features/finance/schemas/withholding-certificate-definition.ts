import { z } from "zod";

import {
  optionalText,
  optionalUuid,
  requiredNumber,
  requiredText,
} from "@/features/shared/schemas/schema-helpers";
import type { ResourceDefinition } from "@/features/shared/types/resource";
import {
  optionalDate,
  optionalTin,
  requiredDate,
} from "@/features/finance/schemas/finance-schema-helpers";

export const withholdingCertificateDefinition: ResourceDefinition = {
  key: "withholding-certificate",
  table: "withholding_certificates",
  singular: "2307 certificate",
  plural: "2307 certificates",
  route: "/finance/withholding",
  parent: { label: "Finance", href: "/finance" },
  titleField: "payor_name",
  subtitleField: "certificate_reference",
  searchColumn: "payor_name",
  description:
    "Tax corporate clients withheld from their payments. Each certificate is a credit against income tax — chase the pending ones.",
  writeRoles: ["owner"],
  filters: [
    {
      param: "status",
      column: "status",
      op: "eq",
      label: "Status",
      picker: true,
      valueLabels: { pending: "Pending", received: "Received" },
    },
    { param: "from", column: "period_to", op: "gte", label: "Period ends from", showValue: true },
    { param: "to", column: "period_to", op: "lte", label: "Period ends by", showValue: true },
  ],
  schema: z
    .object({
      payor_name: requiredText("Client name", 200),
      payor_tin: optionalTin,
      customer_id: optionalUuid,
      atc_code: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{2}[0-9]{3}$/, "ATC codes look like WC100 or WI100.")
        .optional(),
      period_from: requiredDate("Period start"),
      period_to: requiredDate("Period end"),
      income_payment: requiredNumber("Income payment", 0.01),
      tax_withheld: requiredNumber("Tax withheld", 0.01),
      status: z.enum(["pending", "received"]),
      received_on: optionalDate,
      certificate_reference: optionalText(80),
      notes: optionalText(),
    })
    .refine((value) => value.period_to >= value.period_from, {
      message: "The period cannot end before it starts.",
      path: ["period_to"],
    })
    .refine((value) => value.tax_withheld < value.income_payment, {
      message: "Tax withheld must be less than the income payment.",
      path: ["tax_withheld"],
    })
    .refine((value) => value.status !== "received" || Boolean(value.received_on), {
      message: "Enter the date the certificate arrived.",
      path: ["received_on"],
    }),
  fields: [
    { name: "payor_name", label: "Client (withholding agent)", required: true },
    { name: "payor_tin", label: "Client TIN", placeholder: "000-000-000-00000" },
    {
      name: "customer_id",
      label: "Customer record",
      type: "select",
      reference: { table: "customers", labelColumn: "full_name", secondaryColumn: "phone_number" },
      description: "Optional link to the renter on file.",
    },
    {
      name: "atc_code",
      label: "ATC",
      placeholder: "WC100",
      description: "As printed on the 2307 (e.g. WC100/WI100 for rentals). Confirm with the accountant.",
    },
    { name: "period_from", label: "Period from", type: "date", required: true },
    {
      name: "period_to",
      label: "Period to",
      type: "date",
      required: true,
      description: "The credit is counted in the period this date falls in.",
    },
    {
      name: "income_payment",
      label: "Income payment (PHP)",
      type: "number",
      step: "0.01",
      required: true,
      description: "The gross amount the client paid before withholding.",
    },
    { name: "tax_withheld", label: "Tax withheld (PHP)", type: "number", step: "0.01", required: true },
    {
      name: "status",
      label: "Certificate",
      type: "select",
      required: true,
      options: [
        { value: "pending", label: "Pending — tax withheld, 2307 not in hand" },
        { value: "received", label: "Received" },
      ],
    },
    { name: "received_on", label: "Received on", type: "date" },
    { name: "certificate_reference", label: "Certificate reference" },
    { name: "notes", label: "Notes", type: "textarea", className: "md:col-span-2" },
  ],
  columns: [
    { key: "payor_name", label: "Client" },
    { key: "period_to", label: "Period end", format: "date" },
    { key: "income_payment", label: "Income payment", format: "money" },
    { key: "tax_withheld", label: "Withheld", format: "money" },
    { key: "status", label: "Certificate", format: "status" },
    { key: "updated_at", label: "Last updated", format: "datetime" },
  ],
};
