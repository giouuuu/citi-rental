import { z } from "zod";

import { TIN_PATTERN } from "@/features/finance/schemas/finance-schema-helpers";
import type { TaxSettings } from "@/features/finance/lib/income-tax";

const percent = (label: string) =>
  z.coerce
    .number({ error: `${label} is required.` })
    .min(0, `${label} cannot be negative.`)
    .max(99.99, `${label} must be below 100%.`);

const pesos = (label: string) =>
  z.coerce.number({ error: `${label} is required.` }).min(0, `${label} cannot be negative.`);

/**
 * The tax settings form. Rates are entered as percents (12, not 0.12) and
 * stored as fractions; `taxSettingsToRow` converts.
 */
export const taxSettingsSchema = z
  .object({
    registered_name: z.string().trim().max(200).optional(),
    tin: z
      .union([z.literal(""), z.string().trim().regex(TIN_PATTERN, "Use the 000-000-000 or 000-000-000-00000 format.")])
      .optional(),
    rdo_code: z.string().trim().max(10, "RDO codes are at most 10 characters.").optional(),
    registered_address: z.string().trim().max(500).optional(),
    entity_type: z.enum(["sole_proprietor", "partnership", "corporation"]),
    vat_registered: z.enum(["yes", "no"]),
    income_tax_election: z.enum(["undecided", "eight_percent", "graduated_osd", "graduated_itemized"]),
    vat_rate: percent("VAT rate"),
    percentage_tax_rate: percent("Percentage tax rate"),
    eight_percent_rate: percent("8% option rate"),
    eight_percent_exemption: pesos("8% option exemption"),
    osd_rate: percent("OSD rate"),
    vat_threshold: pesos("VAT threshold").min(1, "VAT threshold must be above zero."),
    corporate_income_tax_rate: percent("Corporate income tax rate"),
    fiscal_year_start_month: z.coerce.number().int().min(1).max(12),
  })
  .refine(
    (value) =>
      value.income_tax_election !== "eight_percent" ||
      (value.entity_type === "sole_proprietor" && value.vat_registered === "no"),
    {
      message: "The 8% option is only for non-VAT individual taxpayers.",
      path: ["income_tax_election"],
    },
  );

export type TaxSettingsInput = z.input<typeof taxSettingsSchema>;
export type TaxSettingsValues = z.output<typeof taxSettingsSchema>;

const fraction = (percentValue: number) => Math.round(percentValue * 100) / 10_000;
const asPercent = (rate: number) => Math.round(rate * 10_000) / 100;

/** Form values -> `tax_settings` columns. */
export function taxSettingsToRow(values: TaxSettingsValues) {
  return {
    registered_name: values.registered_name || null,
    tin: values.tin || null,
    rdo_code: values.rdo_code || null,
    registered_address: values.registered_address || null,
    entity_type: values.entity_type,
    vat_registered: values.vat_registered === "yes",
    income_tax_election: values.income_tax_election === "undecided" ? null : values.income_tax_election,
    vat_rate: fraction(values.vat_rate),
    percentage_tax_rate: fraction(values.percentage_tax_rate),
    eight_percent_rate: fraction(values.eight_percent_rate),
    eight_percent_exemption: values.eight_percent_exemption,
    osd_rate: fraction(values.osd_rate),
    vat_threshold: values.vat_threshold,
    corporate_income_tax_rate: fraction(values.corporate_income_tax_rate),
    fiscal_year_start_month: values.fiscal_year_start_month,
  };
}

/** Settings -> form defaults (percents for display). */
export function taxSettingsToForm(settings: TaxSettings): TaxSettingsInput {
  return {
    registered_name: settings.registeredName,
    tin: settings.tin,
    rdo_code: settings.rdoCode,
    registered_address: settings.registeredAddress,
    entity_type: settings.entityType,
    vat_registered: settings.vatRegistered ? "yes" : "no",
    income_tax_election: settings.incomeTaxElection ?? "undecided",
    vat_rate: asPercent(settings.vatRate),
    percentage_tax_rate: asPercent(settings.percentageTaxRate),
    eight_percent_rate: asPercent(settings.eightPercentRate),
    eight_percent_exemption: settings.eightPercentExemption,
    osd_rate: asPercent(settings.osdRate),
    vat_threshold: settings.vatThreshold,
    corporate_income_tax_rate: asPercent(settings.corporateIncomeTaxRate),
    fiscal_year_start_month: settings.fiscalYearStartMonth,
  };
}
