import { describe, expect, it } from "vitest";
import {
  canTransitionRental,
  mapRentalDbError,
  rangesOverlap,
  allowedRentalTransitions,
  parseAvailabilityResult,
} from "./booking-gates";

describe("rangesOverlap", () => {
  it("detects overlapping half-open ranges", () => {
    expect(
      rangesOverlap(
        "2026-07-22T08:00:00Z",
        "2026-07-22T12:00:00Z",
        "2026-07-22T11:00:00Z",
        "2026-07-22T14:00:00Z",
      ),
    ).toBe(true);
  });

  it("allows back-to-back bookings that only touch at the boundary", () => {
    expect(
      rangesOverlap(
        "2026-07-22T08:00:00Z",
        "2026-07-22T12:00:00Z",
        "2026-07-22T12:00:00Z",
        "2026-07-22T16:00:00Z",
      ),
    ).toBe(false);
  });

  it("rejects invalid ranges", () => {
    expect(
      rangesOverlap(
        "2026-07-22T12:00:00Z",
        "2026-07-22T08:00:00Z",
        "2026-07-22T09:00:00Z",
        "2026-07-22T10:00:00Z",
      ),
    ).toBe(false);
  });
});

describe("rental transitions", () => {
  it("gates draft and active workflows", () => {
    expect(allowedRentalTransitions("draft")).toEqual([
      "reserved",
      "active",
      "cancelled",
    ]);
    expect(canTransitionRental("active", "completed")).toBe(true);
    expect(canTransitionRental("active", "reserved")).toBe(false);
    expect(canTransitionRental("completed", "active")).toBe(false);
  });
});

describe("mapRentalDbError", () => {
  it("maps exclusion violations to a booking message", () => {
    expect(
      mapRentalDbError({
        code: "23P01",
        message:
          'conflicting key value violates exclusion constraint "rentals_vehicle_schedule_excl"',
      }),
    ).toMatch(/already booked/i);
  });

  it("keeps explicit booked messages", () => {
    expect(
      mapRentalDbError({
        message:
          "This vehicle is already booked (RNT-1 · reserved) from 2026-07-22 to 2026-07-23. Pick another car or different dates.",
      }),
    ).toMatch(/RNT-1/);
  });
});

describe("parseAvailabilityResult", () => {
  it("parses rpc payload", () => {
    expect(
      parseAvailabilityResult({
        available: false,
        reason: "Vehicle is already booked.",
        vehicle_status: "available",
      }),
    ).toEqual({
      available: false,
      reason: "Vehicle is already booked.",
      vehicle_status: "available",
      conflict: undefined,
    });
  });

  it("treats vehicle as operationally available even when dates conflict", () => {
    const result = parseAvailabilityResult({
      available: false,
      reason: "Vehicle is already booked (RNT-1 · reserved).",
      vehicle_status: "available",
      conflict: {
        id: "r1",
        reference_number: "RNT-1",
        status: "reserved",
        start_at: "2026-07-30T00:00:00Z",
        expected_return_at: "2026-08-02T00:00:00Z",
      },
    });
    expect(result.available).toBe(false);
    expect(result.vehicle_status).toBe("available");
    expect(result.conflict?.status).toBe("reserved");
  });
});

describe("date-based reservation occupancy", () => {
  it("allows a future booking when an earlier reservation does not overlap", () => {
    expect(
      rangesOverlap(
        "2026-07-30T00:00:00+08:00",
        "2026-08-02T00:00:00+08:00",
        "2026-08-05T00:00:00+08:00",
        "2026-08-08T00:00:00+08:00",
      ),
    ).toBe(false);
  });

  it("blocks overlapping reservation windows", () => {
    expect(
      rangesOverlap(
        "2026-07-30T00:00:00+08:00",
        "2026-08-05T00:00:00+08:00",
        "2026-08-03T00:00:00+08:00",
        "2026-08-08T00:00:00+08:00",
      ),
    ).toBe(true);
  });
});
