import { describe, expect, it } from "vitest";

import { parseVehicleOverview } from "@/features/vehicles/lib/vehicle-overview";

const base = {
  summary: { window_days: 10, rental_count: 2, rented_days: 5, collected: "7300.00", income: "7300.00", expenses: "6000.00" },
  categories: [{ category_id: "c1", name: "Interest", amount: "6000.00", entries: 1 }],
  monthly: [{ month: "2026-03", income: "7300.00", expenses: "6000.00", rented_days: 5 }],
  activity: [
    {
      kind: "loan_payment",
      occurred_at: "2026-03-04T16:00:00+00:00",
      record_type: "loan",
      record_id: "l1",
      label: "BDO",
      detail: "Installment 2 of 48",
      status: "recorded",
      amount: "15000.00",
    },
  ],
};

describe("parseVehicleOverview", () => {
  it("derives profit, margin, utilization and category shares for the owner", () => {
    const overview = parseVehicleOverview({ ...base, finance_visible: true });
    expect(overview.income).toBe(7300);
    expect(overview.expenses).toBe(6000);
    expect(overview.profit).toBe(1300);
    expect(overview.marginPercent).toBe(17.8);
    expect(overview.utilizationPercent).toBe(50);
    expect(overview.categories[0].share).toBe(100);
    expect(overview.monthly[0]).toEqual({ month: "2026-03", income: 7300, expenses: 6000, profit: 1300, rentedDays: 5 });
    expect(overview.activity[0].amount).toBe(15000);
  });

  it("hides every cost figure from a non-owner, even if the payload carries them", () => {
    const overview = parseVehicleOverview({ ...base, finance_visible: false, categories: null });
    expect(overview.expenses).toBeNull();
    expect(overview.profit).toBeNull();
    expect(overview.marginPercent).toBeNull();
    expect(overview.monthly[0].expenses).toBeNull();
    expect(overview.categories).toEqual([]);
  });

  it("has no margin without income", () => {
    const overview = parseVehicleOverview({
      finance_visible: true,
      summary: { window_days: 0, income: 0, expenses: 500 },
    });
    expect(overview.profit).toBe(-500);
    expect(overview.marginPercent).toBeNull();
    expect(overview.utilizationPercent).toBe(0);
  });
});
