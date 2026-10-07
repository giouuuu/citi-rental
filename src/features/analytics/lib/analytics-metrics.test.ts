import { describe, expect, it } from "vitest";

import type { VehiclePerformance } from "@/features/analytics/types/analytics";

import {
  conversionPercent,
  cancellationRate,
  daysIdle,
  idleVehicles,
  lateReturnRate,
  percent,
  periodDelta,
  pointsDelta,
  repeatCustomerRate,
  revenuePerFleetDay,
  utilizationPercent,
} from "./analytics-metrics";

const NOW = new Date("2026-09-29T12:00:00Z");

function vehicle(overrides: Partial<VehiclePerformance>): VehiclePerformance {
  return {
    vehicleId: "v",
    plateNumber: "ABC 123",
    name: "Car",
    category: null,
    status: "available",
    dailyRate: 2000,
    rentalCount: 0,
    rentedDays: 0,
    windowDays: 30,
    collected: 0,
    penaltiesBilled: 0,
    lastReturnAt: null,
    nextStartAt: null,
    onRentNow: false,
    ...overrides,
  };
}

describe("ratios", () => {
  it("returns null for an empty denominator instead of NaN", () => {
    expect(percent(3, 0)).toBeNull();
    expect(utilizationPercent(0, 0)).toBeNull();
    expect(revenuePerFleetDay({ collected: 100, fleetVehicleDays: 0 })).toBeNull();
  });

  it("caps utilization at 100", () => {
    expect(utilizationPercent(35, 30)).toBe(100);
    expect(utilizationPercent(15, 60)).toBe(25);
  });

  it("derives the business rates", () => {
    expect(repeatCustomerRate({ customersActive: 8, customersReturning: 2 })).toBe(25);
    expect(cancellationRate({ cancellations: 1, bookingsCreated: 3 })).toBe(33);
    expect(lateReturnRate({ lateReturns: 0, completedRentals: 0 })).toBeNull();
    expect(revenuePerFleetDay({ collected: 1000, fleetVehicleDays: 3 })).toBe(333.33);
  });
});

describe("periodDelta", () => {
  it("reports direction and percent", () => {
    expect(periodDelta(120, 100)).toEqual({ direction: "up", percent: 20 });
    expect(periodDelta(50, 100)).toEqual({ direction: "down", percent: -50 });
    expect(periodDelta(7, 7)).toEqual({ direction: "flat", percent: 0 });
  });

  it("has no percent when the previous period was zero", () => {
    expect(periodDelta(5, 0)).toEqual({ direction: "up", percent: null });
  });
});

describe("pointsDelta", () => {
  it("reports percentage-point change and skips missing values", () => {
    expect(pointsDelta(62, 50)).toEqual({ direction: "up", percent: 12 });
    expect(pointsDelta(40, 40)).toEqual({ direction: "flat", percent: 0 });
    expect(pointsDelta(null, 40)).toBeNull();
  });
});

describe("idleVehicles", () => {
  it("counts whole days since the last return", () => {
    expect(daysIdle("2026-09-19T11:00:00Z", NOW)).toBe(10);
    expect(daysIdle(null, NOW)).toBeNull();
  });

  it("lists only bookable, unbooked cars idle past the threshold", () => {
    const rows = [
      vehicle({ vehicleId: "never", lastReturnAt: null }),
      vehicle({ vehicleId: "long", lastReturnAt: "2026-08-01T00:00:00Z" }),
      vehicle({ vehicleId: "recent", lastReturnAt: "2026-09-25T00:00:00Z" }),
      vehicle({ vehicleId: "booked", lastReturnAt: "2026-08-01T00:00:00Z", nextStartAt: "2026-10-02T00:00:00Z" }),
      vehicle({ vehicleId: "out", lastReturnAt: "2026-06-01T00:00:00Z", onRentNow: true }),
      vehicle({ vehicleId: "shop", status: "maintenance" }),
    ];
    expect(idleVehicles(rows, NOW).map((row) => row.vehicleId)).toEqual(["never", "long"]);
  });
});

describe("conversionPercent", () => {
  it("keeps one decimal and skips an empty step", () => {
    expect(conversionPercent(7, 500)).toBe(1.4);
    expect(conversionPercent(1, 3)).toBe(33.3);
    expect(conversionPercent(0, 0)).toBeNull();
  });
});
