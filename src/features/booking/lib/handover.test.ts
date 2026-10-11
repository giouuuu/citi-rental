import { describe, expect, it } from "vitest";

import {
  deliveryFee,
  handoverBillLine,
  handoverPrice,
  parseHandoverMethod,
} from "./handover";

const fees = { withinCity: 300, outsideCity: 400 };

describe("delivery fees", () => {
  it("charges nothing at the office", () => {
    expect(deliveryFee("office", fees)).toBe(0);
    expect(handoverPrice("office", fees)).toBe("Free");
  });

  it("charges the per-way rate for the zone", () => {
    expect(deliveryFee("within_city", fees)).toBe(300);
    expect(deliveryFee("outside_city", fees)).toBe(400);
    expect(handoverPrice("within_city", fees)).toBe("₱300 per way");
  });

  it("adds nothing when Settings has no rate, and says staff confirm it", () => {
    const unset = { withinCity: null, outsideCity: null };
    expect(deliveryFee("outside_city", unset)).toBe(0);
    expect(handoverPrice("outside_city", unset)).toBe("Fee confirmed by staff");
  });

  it("charges nothing for a booking with no method recorded", () => {
    expect(deliveryFee(null, fees)).toBe(0);
    expect(handoverBillLine("pickup", null, 0)).toBeNull();
  });

  it("only accepts known methods", () => {
    expect(parseHandoverMethod("within_city")).toBe("within_city");
    expect(parseHandoverMethod("airport")).toBeNull();
  });
});

describe("bill lines", () => {
  it("names the leg and zone", () => {
    expect(handoverBillLine("pickup", "within_city", 300)).toEqual({
      label: "Delivery",
      detail: "Within Cebu City",
      fee: 300,
    });
    expect(handoverBillLine("return", "outside_city", 0)).toMatchObject({
      label: "Collection",
      detail: "Outside Cebu City · fee confirmed by staff",
    });
  });
});
