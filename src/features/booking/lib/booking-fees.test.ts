import { describe, expect, it } from "vitest";

import { bookingFeesTotal, parseBookingFees } from "./booking-fees";

describe("booking fees", () => {
  it("reads the stored lines and totals them", () => {
    const lines = parseBookingFees([
      { charge_type_id: "x", name: "Booking fee", amount: 200 },
      { name: "Sanitation", amount: "150.50" },
    ]);
    expect(lines).toEqual([
      { name: "Booking fee", amount: 200, chargeTypeId: "x" },
      { name: "Sanitation", amount: 150.5 },
    ]);
    expect(bookingFeesTotal(lines)).toBe(350.5);
  });

  it("drops malformed or zero lines", () => {
    expect(parseBookingFees([{ name: "", amount: 100 }, { name: "Free", amount: 0 }, null])).toEqual([]);
    expect(parseBookingFees("nope")).toEqual([]);
  });
});
