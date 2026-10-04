import { describe, expect, it } from "vitest";

import { buildProfitOverview } from "@/features/finance/lib/profit-overview";
import type { FinanceStatement } from "@/features/finance/lib/statement";

function statement(): FinanceStatement {
  return {
    receipts: { netOfVat: 100_000, outputVat: 12_000 },
    expenses: {
      net: 60_000,
      lines: [
        { categoryId: "fuel", name: "Fuel and oil", net: 15_000 },
        { categoryId: "pay", name: "Salaries", net: 45_000 },
        { categoryId: "ads", name: "Advertising", net: 0 },
      ],
    },
    depreciation: { total: 25_000, rows: [] },
    monthly: [
      { month: "2026-07", netReceipts: 56_000, outputVat: 6_000, expensesNet: 30_000 },
      { month: "2026-08", netReceipts: 56_000, outputVat: 6_000, expensesNet: 30_000 },
    ],
    vehicles: [
      { vehicleId: "v1", plateNumber: "AAA 111", name: "Vios", receipts: 40_000, expenses: 5_000 },
      { vehicleId: "v2", plateNumber: "BBB 222", name: "City", receipts: 60_000, expenses: 2_000 },
    ],
    exceptions: { highCount: 2 },
  } as unknown as FinanceStatement;
}

describe("buildProfitOverview", () => {
  const overview = buildProfitOverview(statement());

  it("is income minus expenses, VAT excluded", () => {
    expect(overview).toMatchObject({
      income: 100_000,
      expenses: 60_000,
      profit: 40_000,
      marginPercent: 40,
      vatCollected: 12_000,
    });
  });

  it("keeps depreciation out of the headline but reports it beside it", () => {
    expect(overview.depreciation).toBe(25_000);
    expect(overview.profitAfterDepreciation).toBe(15_000);
  });

  it("breaks profit down by month", () => {
    expect(overview.months).toEqual([
      { month: "2026-07", income: 50_000, expenses: 30_000, profit: 20_000 },
      { month: "2026-08", income: 50_000, expenses: 30_000, profit: 20_000 },
    ]);
  });

  it("lists where the money went, biggest first, skipping empty categories", () => {
    expect(overview.categories.map((c) => [c.name, c.share])).toEqual([
      ["Salaries", 75],
      ["Fuel and oil", 25],
    ]);
  });

  it("ranks cars by profit, best first", () => {
    expect(overview.cars.map((c) => [c.plateNumber, c.profit])).toEqual([
      ["BBB 222", 58_000],
      ["AAA 111", 35_000],
    ]);
  });

  it("has no margin without income", () => {
    const empty = statement();
    empty.receipts.netOfVat = 0;
    expect(buildProfitOverview(empty).marginPercent).toBeNull();
  });
});
