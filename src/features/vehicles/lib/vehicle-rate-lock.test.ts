import { describe, expect, it } from "vitest";

import { isVehicleRateLockedByBookings } from "./vehicle-rate-lock";

describe("isVehicleRateLockedByBookings", () => {
  it("locks when any reserved, active, or overdue booking exists", () => {
    expect(isVehicleRateLockedByBookings(["draft", "reserved"])).toBe(true);
    expect(isVehicleRateLockedByBookings(["active"])).toBe(true);
    expect(isVehicleRateLockedByBookings(["overdue"])).toBe(true);
  });

  it("does not lock for completed, cancelled, or draft-only", () => {
    expect(isVehicleRateLockedByBookings([])).toBe(false);
    expect(isVehicleRateLockedByBookings(["draft"])).toBe(false);
    expect(isVehicleRateLockedByBookings(["completed", "cancelled"])).toBe(
      false,
    );
  });
});
