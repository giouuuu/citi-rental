import { describe, expect, it } from "vitest";

import { DEFAULT_TAX_SETTINGS, taxSettingsFromRow } from "@/features/finance/lib/tax-settings";
import {
  taxSettingsSchema,
  taxSettingsToForm,
  taxSettingsToRow,
} from "@/features/finance/schemas/tax-settings-schema";

describe("taxSettingsFromRow", () => {
  it("parses numeric strings and nulls from Postgres", () => {
    const settings = taxSettingsFromRow({
      entity_type: "corporation",
      vat_registered: true,
      vat_rate: "0.1200",
      income_tax_election: null,
      graduated_brackets: [{ over: "0", base: "0", rate: "0" }],
      fiscal_year_start_month: 7,
    });
    expect(settings).toMatchObject({
      entityType: "corporation",
      vatRegistered: true,
      vatRate: 0.12,
      incomeTaxElection: null,
      fiscalYearStartMonth: 7,
      percentageTaxRate: 0.03,
    });
    expect(settings.graduatedBrackets).toEqual([{ over: 0, base: 0, rate: 0 }]);
  });

  it("falls back to defaults for a missing row or junk values", () => {
    expect(taxSettingsFromRow(null)).toBe(DEFAULT_TAX_SETTINGS);
    expect(taxSettingsFromRow({ entity_type: "llc", graduated_brackets: "x" })).toMatchObject({
      entityType: "sole_proprietor",
      graduatedBrackets: DEFAULT_TAX_SETTINGS.graduatedBrackets,
    });
  });
});

describe("tax settings form", () => {
  it("round-trips percents to fractions", () => {
    const form = taxSettingsToForm(DEFAULT_TAX_SETTINGS);
    expect(form.vat_rate).toBe(12);
    const parsed = taxSettingsSchema.parse(form);
    expect(taxSettingsToRow(parsed)).toMatchObject({
      vat_rate: 0.12,
      osd_rate: 0.4,
      vat_registered: false,
      income_tax_election: null,
      tin: null,
    });
  });

  it("rejects the 8% option for VAT-registered or corporate taxpayers", () => {
    const form = { ...taxSettingsToForm(DEFAULT_TAX_SETTINGS), income_tax_election: "eight_percent" as const };
    expect(taxSettingsSchema.safeParse({ ...form, vat_registered: "yes" }).success).toBe(false);
    expect(taxSettingsSchema.safeParse({ ...form, entity_type: "corporation" }).success).toBe(false);
    expect(taxSettingsSchema.safeParse(form).success).toBe(true);
  });

  it("validates the TIN format but allows it blank", () => {
    const form = taxSettingsToForm(DEFAULT_TAX_SETTINGS);
    expect(taxSettingsSchema.safeParse({ ...form, tin: "" }).success).toBe(true);
    expect(taxSettingsSchema.safeParse({ ...form, tin: "123-456-789-00000" }).success).toBe(true);
    expect(taxSettingsSchema.safeParse({ ...form, tin: "12345" }).success).toBe(false);
  });
});
