import { describe, expect, it } from "vitest";

import {
  businessTax,
  compareElections,
  graduatedTax,
  type TaxSettings,
} from "@/features/finance/lib/income-tax";

const BRACKETS = [
  { over: 0, base: 0, rate: 0 },
  { over: 250_000, base: 0, rate: 0.15 },
  { over: 400_000, base: 22_500, rate: 0.2 },
  { over: 800_000, base: 102_500, rate: 0.25 },
  { over: 2_000_000, base: 402_500, rate: 0.3 },
  { over: 8_000_000, base: 2_202_500, rate: 0.35 },
];

function settings(overrides: Partial<TaxSettings> = {}): TaxSettings {
  return {
    registeredName: "",
    tin: "",
    rdoCode: "",
    registeredAddress: "",
    entityType: "sole_proprietor",
    vatRegistered: false,
    vatRate: 0.12,
    percentageTaxRate: 0.03,
    incomeTaxElection: null,
    eightPercentRate: 0.08,
    eightPercentExemption: 250_000,
    osdRate: 0.4,
    vatThreshold: 3_000_000,
    corporateIncomeTaxRate: 0.25,
    graduatedBrackets: BRACKETS,
    fiscalYearStartMonth: 1,
    ...overrides,
  };
}

describe("graduatedTax", () => {
  it.each([
    [0, 0],
    [250_000, 0],
    [300_000, 7_500],
    [400_000, 22_500],
    [1_000_000, 152_500],
    [10_000_000, 2_902_500],
  ])("taxable %d -> %d", (taxable, tax) => {
    expect(graduatedTax(taxable, BRACKETS)).toBe(tax);
  });
});

describe("compareElections", () => {
  it("compares all three individual options and marks the lowest", () => {
    const rows = compareElections({
      grossReceipts: 1_500_000,
      deductions: 1_100_000,
      settings: settings({ incomeTaxElection: "graduated_osd" }),
    });
    const byOption = Object.fromEntries(rows.map((row) => [row.option, row]));

    // 8% of (1.5M - 250k), in lieu of percentage tax.
    expect(byOption.eight_percent.totalTax).toBe(100_000);
    // OSD: taxable 900k -> 102,500 + 25% x 100k = 127,500; + 3% x 1.5M = 45,000.
    expect(byOption.graduated_osd).toMatchObject({ incomeTax: 127_500, totalTax: 172_500, elected: true });
    // Itemized: taxable 400k -> 22,500; + 45,000.
    expect(byOption.graduated_itemized.totalTax).toBe(67_500);
    expect(rows.filter((row) => row.lowest).map((row) => row.option)).toEqual(["graduated_itemized"]);
  });

  it("rules out 8% for VAT-registered taxpayers and above the threshold", () => {
    const vat = compareElections({ grossReceipts: 1_000_000, deductions: 0, settings: settings({ vatRegistered: true }) });
    expect(vat[0]).toMatchObject({ option: "eight_percent", eligible: false, lowest: false });
    // No percentage tax when VAT-registered.
    expect(vat[1].percentageTax).toBe(0);

    const big = compareElections({ grossReceipts: 3_500_000, deductions: 0, settings: settings() });
    expect(big[0].eligible).toBe(false);
  });

  it("uses the corporate rate and drops 8% for corporations", () => {
    const rows = compareElections({
      grossReceipts: 2_000_000,
      deductions: 1_200_000,
      settings: settings({ entityType: "corporation", incomeTaxElection: "graduated_itemized" }),
    });
    expect(rows.map((row) => row.option)).toEqual(["corporate_osd", "corporate_itemized"]);
    expect(rows[1]).toMatchObject({ taxableIncome: 800_000, incomeTax: 200_000, elected: true });
  });

  it("never taxes a loss", () => {
    const rows = compareElections({ grossReceipts: 100_000, deductions: 500_000, settings: settings() });
    expect(rows.find((row) => row.option === "graduated_itemized")?.incomeTax).toBe(0);
  });
});

describe("businessTax", () => {
  it("nets output against creditable input VAT when registered", () => {
    expect(
      businessTax({ grossReceipts: 0, outputVat: 1_200, creditableInputVat: 1_500, settings: settings({ vatRegistered: true }) }),
    ).toEqual({ kind: "vat", form: "2550Q", outputVat: 1_200, creditableInputVat: 1_500, payable: -300 });
  });

  it("charges percentage tax when non-VAT, unless 8% was elected", () => {
    expect(businessTax({ grossReceipts: 100_000, outputVat: 0, creditableInputVat: 0, settings: settings() })).toMatchObject({
      kind: "percentage",
      due: 3_000,
      waivedByEightPercent: false,
    });
    expect(
      businessTax({
        grossReceipts: 100_000,
        outputVat: 0,
        creditableInputVat: 0,
        settings: settings({ incomeTaxElection: "eight_percent" }),
      }),
    ).toMatchObject({ due: 0, waivedByEightPercent: true });
  });
});
