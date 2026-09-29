import { describe, expect, it } from "vitest";

import type { AnalyticsTimeseriesPoint } from "@/features/analytics/types/analytics";

import { bucketLabel, forwardBookedPercent, toTrendRows } from "./trend-series";

function point(overrides: Partial<AnalyticsTimeseriesPoint>): AnalyticsTimeseriesPoint {
  return {
    bucketStart: "2026-09-01",
    collected: 0,
    penaltiesBilled: 0,
    bookingsCreated: 0,
    bookingsPublic: 0,
    cancellations: 0,
    rentedVehicleDays: 0,
    fleetVehicleDays: 0,
    ...overrides,
  };
}

describe("trend rows", () => {
  it("labels buckets by grain", () => {
    expect(bucketLabel("2026-09-07", "week")).toBe("Sep 7");
    expect(bucketLabel("2026-09-01", "month")).toBe("Sep 2026");
  });

  it("splits bookings by source and derives utilization", () => {
    const [row] = toTrendRows(
      [point({ bookingsCreated: 5, bookingsPublic: 3, rentedVehicleDays: 6, fleetVehicleDays: 8 })],
      "day",
    );
    expect(row).toMatchObject({ website: 3, frontDesk: 2, utilization: 75 });
  });

  it("leaves utilization empty for a bucket with no fleet", () => {
    expect(toTrendRows([point({})], "day")[0].utilization).toBeNull();
  });

  it("computes the booked share of the next N days", () => {
    const points = [
      point({ rentedVehicleDays: 4, fleetVehicleDays: 8 }),
      point({ rentedVehicleDays: 2, fleetVehicleDays: 8 }),
      point({ rentedVehicleDays: 8, fleetVehicleDays: 8 }),
    ];
    expect(forwardBookedPercent(points, 2)).toBe(38);
    expect(forwardBookedPercent([], 7)).toBeNull();
  });
});
