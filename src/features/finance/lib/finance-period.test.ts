import { describe, expect, it } from "vitest";

import {
  addMonthsToKey,
  defaultFinancePeriod,
  financePeriodOptions,
  financeUrl,
  fiscalYearOf,
  resolveFinanceWindow,
} from "@/features/finance/lib/finance-period";

// 2026-10-04 10:00 Manila.
const NOW = new Date("2026-10-04T02:00:00.000Z");

describe("addMonthsToKey", () => {
  it("crosses year boundaries both ways", () => {
    expect(addMonthsToKey("2026-11-01", 3)).toBe("2027-02-01");
    expect(addMonthsToKey("2026-02-01", -3)).toBe("2025-11-01");
  });
});

describe("resolveFinanceWindow", () => {
  it("defaults to the current quarter", () => {
    expect(resolveFinanceWindow({}, 1, NOW)).toMatchObject({
      from: "2026-10-01",
      to: "2026-12-31",
      kind: "quarter",
      period: "2026-Q4",
      label: "Q4 2026",
    });
  });

  it("resolves months, including leap February", () => {
    expect(resolveFinanceWindow({ period: "2028-02" }, 1, NOW)).toMatchObject({
      from: "2028-02-01",
      to: "2028-02-29",
      kind: "month",
      days: 29,
    });
  });

  it("resolves fiscal quarters and years from the fiscal start month", () => {
    // Fiscal year starting July: Q1 FY2026 is Jul-Sep 2026.
    expect(resolveFinanceWindow({ period: "2026-Q1" }, 7, NOW)).toMatchObject({
      from: "2026-07-01",
      to: "2026-09-30",
      label: "Q1 FY2026",
    });
    expect(resolveFinanceWindow({ period: "FY2026" }, 7, NOW)).toMatchObject({
      from: "2026-07-01",
      to: "2027-06-30",
      kind: "year",
    });
  });

  it("year to date runs from the fiscal year start to today", () => {
    expect(resolveFinanceWindow({ period: "ytd" }, 1, NOW)).toMatchObject({
      from: "2026-01-01",
      to: "2026-10-04",
    });
    expect(resolveFinanceWindow({ period: "ytd" }, 11, NOW).from).toBe("2025-11-01");
  });

  it("prefers valid custom dates and clamps them to 400 days", () => {
    expect(resolveFinanceWindow({ period: "2026-03", from: "2026-01-05", to: "2026-02-10" }, 1, NOW)).toMatchObject({
      from: "2026-01-05",
      to: "2026-02-10",
      kind: "custom",
      period: null,
    });
    expect(resolveFinanceWindow({ from: "2024-01-01", to: "2026-01-01" }, 1, NOW).days).toBe(400);
  });

  it("falls back to the default on junk", () => {
    expect(resolveFinanceWindow({ period: "2026-Q9", from: "2026-13-01", to: "x" }, 1, NOW).period).toBe("2026-Q4");
  });
});

describe("fiscal helpers", () => {
  it("names a fiscal year by the year it starts in", () => {
    expect(fiscalYearOf("2026-03-15", 7)).toBe(2025);
    expect(fiscalYearOf("2026-07-01", 7)).toBe(2026);
    expect(defaultFinancePeriod(7, NOW)).toBe("2026-Q2");
  });

  it("lists recent periods for the picker", () => {
    const options = financePeriodOptions(1, NOW);
    expect(options[0].value).toBe("ytd");
    expect(options.filter((o) => o.group === "Quarters").map((o) => o.value).slice(0, 3)).toEqual([
      "2026-Q4",
      "2026-Q3",
      "2026-Q2",
    ]);
    expect(options.filter((o) => o.group === "Months")).toHaveLength(12);
    expect(options.filter((o) => o.group === "Years").map((o) => o.value)).toEqual(["FY2026", "FY2025", "FY2024"]);
  });

  it("carries each period's days so the picker can draw them", () => {
    const options = financePeriodOptions(7, NOW);
    expect(options.find((o) => o.value === "FY2025")).toMatchObject({
      label: "FY2025",
      from: "2025-07-01",
      to: "2026-06-30",
    });
    expect(options[0]).toMatchObject({ label: "Year to date", from: "2026-07-01" });
  });
});

describe("financeUrl", () => {
  it("omits the default period and pins both custom dates", () => {
    const current = new URLSearchParams("from=2026-01-01&to=2026-01-31");
    expect(financeUrl(current, { period: "2026-Q4" }, "2026-Q4")).toBe("/finance");
    expect(financeUrl(current, { period: "2026-09" }, "2026-Q4")).toBe("/finance?period=2026-09");
    expect(
      financeUrl(new URLSearchParams("period=2026-09"), { custom: { from: "2026-02-01", to: "2026-02-15" } }, "2026-Q4"),
    ).toBe("/finance?from=2026-02-01&to=2026-02-15");
  });
});

describe("page default period", () => {
  it("uses the page's fallback when the URL has none", () => {
    expect(resolveFinanceWindow({}, 1, NOW, "ytd")).toMatchObject({ kind: "ytd", from: "2026-01-01" });
    expect(resolveFinanceWindow({ period: "2026-09" }, 1, NOW, "ytd").kind).toBe("month");
  });
});
