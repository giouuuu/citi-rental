import { describe, expect, it } from "vitest";

import { idleVehicles } from "@/features/analytics/lib/analytics-metrics";
import { buildDemoWorkspace } from "@/features/shared/lib/demo-workspace";

import {
  demoOverview,
  demoTimeseries,
  demoTopCustomers,
  demoVehiclePerformance,
} from "./demo-analytics";

const NOW = new Date("2026-09-29T04:00:00Z"); // noon in Manila
const workspace = buildDemoWorkspace(NOW);
const FROM = "2026-08-31";
const TO = "2026-09-29";

function total(values: number[]) {
  return Math.round(values.reduce((sum, value) => sum + value, 0) * 100) / 100;
}

describe("demo analytics", () => {
  it("is deterministic for the same day", () => {
    expect(buildDemoWorkspace(NOW)).toEqual(workspace);
  });

  it("never overlaps two occupying rentals on one car", () => {
    const occupying = workspace.rentals.filter((r) => !["draft", "cancelled"].includes(r.status));
    for (const a of occupying) {
      for (const b of occupying) {
        if (a.id >= b.id || a.vehicleId !== b.vehicleId) continue;
        const overlap =
          new Date(a.startAt) < new Date(b.expectedReturnAt) &&
          new Date(b.startAt) < new Date(a.expectedReturnAt);
        expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it("agrees across panels: vehicles and buckets sum to the overview", () => {
    const overview = demoOverview(workspace, FROM, TO, NOW);
    const vehicles = demoVehiclePerformance(workspace, FROM, TO, NOW);
    const series = demoTimeseries(workspace, FROM, TO, "week", NOW);

    expect(total(vehicles.map((v) => v.collected))).toBe(overview.collected);
    expect(total(series.map((p) => p.collected))).toBe(overview.collected);
    expect(total(series.map((p) => p.bookingsCreated))).toBe(overview.bookingsCreated);
    expect(overview.bookingsPublic + overview.bookingsOps).toBe(overview.bookingsCreated);
    expect(overview.customersNew + overview.customersReturning).toBe(overview.customersActive);
  });

  it("keeps today's operational picture", () => {
    const overview = demoOverview(workspace, FROM, TO, NOW);
    expect(overview.overdueNow).toBe(1);
    expect(overview.draftsOpen).toBeGreaterThan(0);
    const idle = idleVehicles(demoVehiclePerformance(workspace, FROM, TO, NOW), NOW);
    expect(idle.map((v) => v.plateNumber)).toContain("SED 4417");
  });

  it("zero-fills buckets and works for a future window", () => {
    const series = demoTimeseries(workspace, "2026-09-29", "2026-10-28", "day", NOW);
    expect(series).toHaveLength(30);
    expect(series.some((p) => p.rentedVehicleDays > 0)).toBe(true);
    expect(series.every((p) => p.fleetVehicleDays > 0)).toBe(true);
  });

  it("ranks top customers by collected money and respects the limit", () => {
    const top = demoTopCustomers(workspace, "2025-10-01", TO, 5);
    expect(top).toHaveLength(5);
    for (let i = 1; i < top.length; i += 1) {
      expect(top[i - 1].collectedInWindow).toBeGreaterThanOrEqual(top[i].collectedInWindow);
    }
  });
});
