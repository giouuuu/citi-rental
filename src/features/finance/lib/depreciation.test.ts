import { describe, expect, it } from "vitest";

import {
  bookValueAt,
  depreciationBetween,
  depreciationSchedule,
  type FixedAsset,
} from "@/features/finance/lib/depreciation";

function asset(overrides: Partial<FixedAsset> = {}): FixedAsset {
  return {
    id: "a1",
    name: "Vios",
    vehicleId: null,
    vehiclePlate: null,
    acquisitionDate: "2025-01-15",
    acquisitionCost: 900_000,
    salvageValue: 100_000,
    usefulLifeMonths: 60,
    method: "straight_line",
    disposedOn: null,
    ...overrides,
  };
}

const sum = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;

describe("depreciationSchedule", () => {
  it("straight-line spreads cost minus salvage evenly from the acquisition month", () => {
    const schedule = depreciationSchedule(asset());
    expect(schedule).toHaveLength(60);
    expect(schedule[0].month).toBe("2025-01-01");
    expect(schedule[59].month).toBe("2029-12-01");
    expect(sum(schedule.map((m) => m.amount))).toBe(800_000);
    expect(schedule[11].accumulated).toBe(160_000);
    expect(schedule[59].bookValue).toBe(100_000);
    // Centavo rounding alternates but never drifts.
    expect(schedule[0].amount).toBeCloseTo(13_333.33, 2);
  });

  it("sum-of-years-digits front-loads by remaining years", () => {
    const schedule = depreciationSchedule(
      asset({
        acquisitionDate: "2025-01-01",
        acquisitionCost: 600_000,
        salvageValue: 0,
        usefulLifeMonths: 36,
        method: "sum_of_years_digits",
      }),
    );
    const year = (index: number) => sum(schedule.slice(index * 12, index * 12 + 12).map((m) => m.amount));
    expect([year(0), year(1), year(2)]).toEqual([300_000, 200_000, 100_000]);
  });

  it("double-declining balance switches to straight-line and stops at salvage", () => {
    const schedule = depreciationSchedule(
      asset({
        acquisitionDate: "2025-01-01",
        acquisitionCost: 1_000_000,
        salvageValue: 100_000,
        method: "declining_balance",
      }),
    );
    const year = (index: number) => sum(schedule.slice(index * 12, index * 12 + 12).map((m) => m.amount));
    expect([0, 1, 2, 3, 4].map(year)).toEqual([400_000, 240_000, 144_000, 86_400, 29_600]);
    expect(schedule.at(-1)?.bookValue).toBe(100_000);
  });

  it("stops after the month of disposal", () => {
    const schedule = depreciationSchedule(asset({ disposedOn: "2025-06-10" }));
    expect(schedule).toHaveLength(6);
    expect(schedule.at(-1)?.month).toBe("2025-06-01");
  });
});

describe("depreciationBetween", () => {
  const schedule = depreciationSchedule(asset());

  it("counts whole months in a quarter", () => {
    expect(depreciationBetween(schedule, "2025-01-01", "2025-03-31")).toBe(40_000);
  });

  it("prorates a month the window only partly covers", () => {
    const january = schedule[0].amount;
    expect(depreciationBetween(schedule, "2025-01-01", "2025-01-15")).toBeCloseTo((january * 15) / 31, 2);
  });

  it("is zero before acquisition and after the useful life", () => {
    expect(depreciationBetween(schedule, "2024-01-01", "2024-12-31")).toBe(0);
    expect(depreciationBetween(schedule, "2031-01-01", "2031-12-31")).toBe(0);
  });
});

describe("bookValueAt", () => {
  it("reports accumulated depreciation and net book value at a date", () => {
    const item = asset();
    expect(bookValueAt(item, depreciationSchedule(item), "2025-12-31")).toEqual({
      accumulated: 160_000,
      bookValue: 740_000,
    });
  });
});
