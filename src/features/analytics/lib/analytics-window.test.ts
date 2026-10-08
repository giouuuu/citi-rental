import { describe, expect, it } from "vitest";

import {
  analyticsUrl,
  defaultBucketFor,
  resolveAnalyticsTab,
  resolveAnalyticsWindow,
} from "./analytics-window";

// 2026-09-29 20:00 in Manila.
const NOW = new Date("2026-09-29T12:00:00Z");

describe("resolveAnalyticsWindow", () => {
  it("defaults to the last 30 Manila days ending today", () => {
    const window = resolveAnalyticsWindow({}, NOW);
    expect(window).toMatchObject({
      from: "2026-08-31",
      to: "2026-09-29",
      preset: "30d",
      bucket: "day",
      days: 30,
      previous: { from: "2026-08-01", to: "2026-08-30" },
    });
  });

  it("uses Manila's date, not UTC's, late in the evening", () => {
    const window = resolveAnalyticsWindow({ range: "7d" }, new Date("2026-09-29T17:00:00Z"));
    expect(window.to).toBe("2026-09-30");
    expect(window.from).toBe("2026-09-24");
  });

  it("prefers explicit valid dates over a preset", () => {
    const window = resolveAnalyticsWindow(
      { range: "7d", from: "2026-01-01", to: "2026-03-31" },
      NOW,
    );
    expect(window).toMatchObject({ preset: "custom", days: 90, bucket: "week" });
  });

  it("falls back when dates are reversed or malformed", () => {
    expect(resolveAnalyticsWindow({ from: "2026-09-10", to: "2026-09-01" }, NOW).preset).toBe("30d");
    expect(resolveAnalyticsWindow({ from: "nope", to: "2026-09-01" }, NOW).preset).toBe("30d");
    expect(resolveAnalyticsWindow({ range: "5y" }, NOW).preset).toBe("30d");
  });

  it("caps a custom window at the RPC's 400-day limit", () => {
    const window = resolveAnalyticsWindow({ from: "2020-01-01", to: "2026-09-29" }, NOW);
    expect(window.days).toBe(400);
    expect(window.to).toBe("2026-09-29");
  });

  it("honours an explicit bucket and ignores an unknown one", () => {
    expect(resolveAnalyticsWindow({ bucket: "month" }, NOW).bucket).toBe("month");
    expect(resolveAnalyticsWindow({ bucket: "hour" }, NOW).bucket).toBe("day");
    expect(resolveAnalyticsWindow({ range: "12m" }, NOW).bucket).toBe("month");
  });
});

describe("defaultBucketFor", () => {
  it("steps day → week → month as windows grow", () => {
    expect(defaultBucketFor(31)).toBe("day");
    expect(defaultBucketFor(32)).toBe("week");
    expect(defaultBucketFor(151)).toBe("month");
  });
});

describe("analyticsUrl", () => {
  it("drops the default preset and clears custom dates", () => {
    const current = new URLSearchParams("from=2026-01-01&to=2026-02-01&bucket=week");
    expect(analyticsUrl(current, { range: "30d" })).toBe("/analytics?bucket=week");
    expect(analyticsUrl(current, { range: "90d" })).toBe("/analytics?bucket=week&range=90d");
  });

  it("pins both ends when a date changes", () => {
    const current = new URLSearchParams("range=7d");
    expect(analyticsUrl(current, { custom: { from: "2026-09-01", to: "2026-09-29" } })).toBe(
      "/analytics?from=2026-09-01&to=2026-09-29",
    );
  });

  it("removes the bucket for auto", () => {
    expect(analyticsUrl(new URLSearchParams("bucket=day"), { bucket: "auto" })).toBe("/analytics");
  });
});

describe("analytics tabs", () => {
  it("keeps the period when switching tabs and drops the default tab", () => {
    const current = new URLSearchParams("range=90d&bucket=week");
    expect(analyticsUrl(current, { tab: "website" })).toBe("/analytics?range=90d&bucket=week&tab=website");
    expect(analyticsUrl(new URLSearchParams("tab=cars"), { tab: "overview" })).toBe("/analytics");
  });

  it("keeps the tab when the period changes", () => {
    expect(analyticsUrl(new URLSearchParams("tab=website"), { range: "7d" })).toBe(
      "/analytics?tab=website&range=7d",
    );
  });

  it("falls back to Overview for unknown tabs", () => {
    expect(resolveAnalyticsTab("website")).toBe("website");
    expect(resolveAnalyticsTab("nope")).toBe("overview");
    expect(resolveAnalyticsTab(null)).toBe("overview");
  });
});
