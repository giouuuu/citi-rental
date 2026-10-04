import { describe, expect, it } from "vitest";

import type { FixedAsset } from "@/features/finance/lib/depreciation";
import type { TaxSettings } from "@/features/finance/lib/income-tax";
import { buildStatement, type StatementPayload } from "@/features/finance/lib/statement";

const settings: TaxSettings = {
  registeredName: "Zeke Car Rentals",
  tin: "",
  rdoCode: "",
  registeredAddress: "",
  entityType: "sole_proprietor",
  vatRegistered: false,
  vatRate: 0.12,
  percentageTaxRate: 0.03,
  incomeTaxElection: "graduated_itemized",
  eightPercentRate: 0.08,
  eightPercentExemption: 250_000,
  osdRate: 0.4,
  vatThreshold: 3_000_000,
  corporateIncomeTaxRate: 0.25,
  graduatedBrackets: [
    { over: 0, base: 0, rate: 0 },
    { over: 250_000, base: 0, rate: 0.15 },
  ],
  fiscalYearStartMonth: 1,
};

// Mirrors the 05_finance.test.sql figures for W = 2026-03-01..2026-03-10
// before VAT registration.
const payload: StatementPayload = {
  receipts: {
    gross_collected: 16210,
    refunds: 1200,
    net_receipts: 15010,
    vatable: 0,
    zero_rated: 0,
    exempt: 0,
    non_vat: 15010,
    output_vat: 0,
    net_of_vat: 15010,
    public_web: 5700,
    ops: 9310,
    penalties_billed: 500,
    payment_count: 10,
    outstanding_balance: 5215,
  },
  withholding: {
    cwt_withheld: 150,
    cwt_received: 50,
    cwt_pending: 100,
    cwt_income_payments: 3000,
    ewt_withheld: 20,
    ewt_unremitted: 20,
  },
  expenses: [
    { category_id: "c1", code: "repairs_labor", name: "Repairs", bir_line: "Repairs and maintenance", entries: 1, gross: 1120, input_vat: 120, net: 1000, creditable_input_vat: 120, ewt: 20, at_risk: 1000 },
    { category_id: "c2", code: "fuel_oil", name: "Fuel", bir_line: "Fuel and oil", entries: 1, gross: 500, input_vat: 0, net: 500, creditable_input_vat: 0, ewt: 0, at_risk: 500 },
    { category_id: "c3", code: "rental", name: "Rental", bir_line: "Rental", entries: 1, gross: 3000, input_vat: 100, net: 2900, creditable_input_vat: 0, ewt: 0, at_risk: 0 },
  ],
  vehicles: [
    { vehicle_id: "v1", plate_number: "AAA 111", name: "Vios", status: "available", receipts_net_of_vat: 7300, expenses_net: 1000 },
    { vehicle_id: "v2", plate_number: "BBB 222", name: "City", status: "available", receipts_net_of_vat: 5700, expenses_net: 0 },
    { vehicle_id: "v4", plate_number: "DDD 444", name: "Retired", status: "inactive", receipts_net_of_vat: 0, expenses_net: 0 },
  ],
  monthly: [{ month: "2026-03", net_receipts: 15010, output_vat: 0, expenses_net: 4400, creditable_input_vat: 120, ewt: 20 }],
  exceptions: [
    { kind: "missing_document", severity: "high", record_type: "expense", record_id: "e2", label: "Fuel", amount: 500, occurred_on: "2026-03-04" },
    { kind: "vehicle_without_cost", severity: "high", record_type: "vehicle", record_id: "v2", label: "BBB 222", amount: null, occurred_on: null },
    { kind: "certificate_pending", severity: "medium", record_type: "certificate", record_id: "w1", label: "Acme", amount: 100, occurred_on: "2026-03-10" },
  ],
};

// 310,000 over 31 months straight-line from March 2026: exactly 10,000 a month.
const vios: FixedAsset = {
  id: "fa1",
  name: "Vios",
  vehicleId: "v1",
  vehiclePlate: "AAA 111",
  acquisitionDate: "2026-03-01",
  acquisitionCost: 310_000,
  salvageValue: 0,
  usefulLifeMonths: 31,
  method: "straight_line",
  disposedOn: null,
};

describe("buildStatement", () => {
  const statement = buildStatement({
    payload,
    assets: [vios],
    settings,
    window: { from: "2026-03-01", to: "2026-03-10" },
  });

  it("adds tax withheld at source back to the income-tax base", () => {
    expect(statement.receipts.incomeTaxBase).toBe(15_160);
  });

  it("prorates depreciation into a partial-month window", () => {
    // 10 of 31 days of a 10,000 month.
    expect(statement.depreciation.total).toBe(3225.81);
    expect(statement.depreciation.rows[0]).toMatchObject({ accumulated: 3225.81, bookValue: 306_774.19 });
  });

  it("builds the income statement and shows the at-risk exposure", () => {
    expect(statement.incomeStatement).toEqual({
      revenue: 15_160,
      operatingExpenses: 4_400,
      depreciation: 3225.81,
      netIncome: 7534.19,
      atRisk: 1_500,
      netIncomeIfDisallowed: 9034.19,
    });
    // Itemized deductions exclude the at-risk amounts.
    expect(statement.tax.allowableDeductions).toBe(6125.81);
  });

  it("orders vehicles by margin so the weakest unit is first, dropping idle retired units", () => {
    expect(statement.vehicles.map((row) => [row.plateNumber, row.margin])).toEqual([
      ["AAA 111", 3074.19],
      ["BBB 222", 5700],
    ]);
    expect(statement.vehicles[0].hasAsset).toBe(true);
  });

  it("computes percentage tax on gross receipts including withheld tax", () => {
    expect(statement.tax.business).toEqual({
      kind: "percentage",
      form: "2551Q",
      base: 15_160,
      rate: 0.03,
      due: 454.8,
      waivedByEightPercent: false,
    });
    expect(statement.tax.forms.quarterly).toBe("1701Q");
  });

  it("groups exceptions with their explanation", () => {
    expect(statement.exceptions.count).toBe(3);
    expect(statement.exceptions.highCount).toBe(2);
    expect(statement.exceptions.groups.map((group) => [group.kind, group.rows.length])).toEqual([
      ["missing_document", 1],
      ["vehicle_without_cost", 1],
      ["certificate_pending", 1],
    ]);
    expect(statement.exceptions.groups[0].title).toBe("No valid invoice or receipt");
  });
});
