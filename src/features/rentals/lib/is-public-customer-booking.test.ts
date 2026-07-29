import { describe, expect, it } from "vitest";

import { isPublicCustomerBooking } from "./is-public-customer-booking";

describe("isPublicCustomerBooking", () => {
  it("detects WEB reference numbers", () => {
    expect(
      isPublicCustomerBooking({ reference_number: "WEB-260727-ABC123" }),
    ).toBe(true);
    expect(
      isPublicCustomerBooking({ reference_number: "web-260727-abc123" }),
    ).toBe(true);
  });

  it("allows ops-created rentals", () => {
    expect(
      isPublicCustomerBooking({ reference_number: "RNT-260715-001" }),
    ).toBe(false);
    expect(isPublicCustomerBooking({ reference_number: null })).toBe(false);
    expect(isPublicCustomerBooking({})).toBe(false);
  });
});
