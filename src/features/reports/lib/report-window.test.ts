import { describe, expect, it } from "vitest";

import { resolveReportWindow } from "@/features/reports/lib/report-window";

// 08:00 on Oct 4 in Manila, still Oct 3 in UTC.
const NOW = new Date("2026-10-04T00:00:00.000Z");

describe("resolveReportWindow", () => {
  it("defaults to the 30 Manila days through today", () => {
    const window = resolveReportWindow({}, NOW);
    expect(window.fromValue).toBe("2026-09-05");
    expect(window.toValue).toBe("2026-10-04");
  });

  it("treats `to` as an inclusive day and bounds it at the next Manila midnight", () => {
    const window = resolveReportWindow({ from: "2026-10-01", to: "2026-10-04" }, NOW);
    expect(window.from.toISOString()).toBe("2026-09-30T16:00:00.000Z");
    expect(window.to.toISOString()).toBe("2026-10-04T16:00:00.000Z");
  });

  it("allows a single day and falls back when `from` is after `to` or malformed", () => {
    expect(resolveReportWindow({ from: "2026-10-04", to: "2026-10-04" }, NOW).fromValue).toBe(
      "2026-10-04",
    );
    expect(resolveReportWindow({ from: "2026-10-09", to: "2026-10-04" }, NOW).fromValue).toBe(
      "2026-09-05",
    );
    expect(resolveReportWindow({ from: "nope", to: "2026-02-30" }, NOW).toValue).toBe("2026-10-04");
  });
});
