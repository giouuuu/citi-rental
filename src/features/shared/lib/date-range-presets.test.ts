import { describe, expect, it } from "vitest";

import {
  defaultDateRangePresets,
  formatDateRange,
  matchDateRangePreset,
  monthDateRangePresets,
  quarterDateRangePresets,
  quickDateRangePresets,
  yearDateRangePresets,
} from "@/features/shared/lib/date-range-presets";

// A Sunday, the first day of a quarter's last month.
const TODAY = "2026-10-04";

function range(key: Parameters<typeof quickDateRangePresets>[1]) {
  const [preset] = quickDateRangePresets(TODAY, key);
  return { from: preset.from, to: preset.to };
}

describe("quickDateRangePresets", () => {
  it("anchors rolling ranges on today, both ends inclusive", () => {
    expect(range(["today"])).toEqual({ from: TODAY, to: TODAY });
    expect(range(["yesterday"])).toEqual({ from: "2026-10-03", to: "2026-10-03" });
    expect(range(["last-7-days"])).toEqual({ from: "2026-09-28", to: TODAY });
    expect(range(["last-30-days"])).toEqual({ from: "2026-09-05", to: TODAY });
  });

  it("runs weeks Sunday to Saturday", () => {
    expect(range(["this-week"])).toEqual({ from: "2026-10-04", to: "2026-10-10" });
    expect(range(["last-week"])).toEqual({ from: "2026-09-27", to: "2026-10-03" });
    const [midweek] = quickDateRangePresets("2026-10-07", ["this-week"]);
    expect(midweek.from).toBe("2026-10-04");
  });

  it("covers whole calendar months, quarters and years", () => {
    expect(range(["this-month"])).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(range(["last-month"])).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(range(["this-quarter"])).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(range(["last-quarter"])).toEqual({ from: "2026-07-01", to: "2026-09-30" });
    expect(range(["year-to-date"])).toEqual({ from: "2026-01-01", to: TODAY });
    expect(range(["last-year"])).toEqual({ from: "2025-01-01", to: "2025-12-31" });
  });

  it("handles a January last month", () => {
    const [preset] = quickDateRangePresets("2026-01-15", ["last-month"]);
    expect(preset).toMatchObject({ from: "2025-12-01", to: "2025-12-31" });
  });
});

describe("period presets", () => {
  it("lists quarters newest first, crossing years", () => {
    expect(quarterDateRangePresets(TODAY, 6).map((preset) => preset.label)).toEqual([
      "Q4 2026",
      "Q3 2026",
      "Q2 2026",
      "Q1 2026",
      "Q4 2025",
      "Q3 2025",
    ]);
    expect(quarterDateRangePresets(TODAY, 1)[0]).toMatchObject({
      value: "2026-Q4",
      from: "2026-10-01",
      to: "2026-12-31",
    });
  });

  it("ends February on the right day", () => {
    const months = monthDateRangePresets("2028-03-10", 2);
    expect(months[1]).toMatchObject({ label: "February 2028", from: "2028-02-01", to: "2028-02-29" });
  });

  it("lists years newest first", () => {
    expect(yearDateRangePresets(TODAY).map((preset) => preset.value)).toEqual(["2026", "2025", "2024"]);
  });

  it("groups the default rail", () => {
    const groups = [...new Set(defaultDateRangePresets(TODAY).map((preset) => preset.group))];
    expect(groups).toEqual(["Quick", "Quarters", "Months", "Years"]);
  });
});

describe("matchDateRangePreset", () => {
  const presets = defaultDateRangePresets(TODAY);

  it("prefers the named preset", () => {
    expect(matchDateRangePreset(presets, null, "2026-Q3")?.label).toBe("Q3 2026");
  });

  it("falls back to the first preset with the same days", () => {
    expect(
      matchDateRangePreset(presets, { from: "2026-10-01", to: "2026-10-31" })?.label,
    ).toBe("This month");
  });

  it("returns null for a custom or partial range", () => {
    expect(matchDateRangePreset(presets, { from: "2026-10-02", to: "2026-10-03" })).toBeNull();
    expect(matchDateRangePreset(presets, { from: "2026-10-02" })).toBeNull();
  });
});

describe("formatDateRange", () => {
  it("keeps the label short", () => {
    expect(formatDateRange({ from: TODAY, to: TODAY })).toBe("Oct 4, 2026");
    expect(formatDateRange({ from: "2026-10-01", to: TODAY })).toBe("Oct 1 – 4, 2026");
    expect(formatDateRange({ from: "2026-09-28", to: TODAY })).toBe("Sep 28 – Oct 4, 2026");
    expect(formatDateRange({ from: "2025-12-28", to: TODAY })).toBe("Dec 28, 2025 – Oct 4, 2026");
  });
});
