import { describe, expect, it } from "vitest";

import type { CustomerRental } from "@/features/customers/types/customer-rental";

import { isLateReturn, rentalOutstanding, summarizeCustomerRentals } from "./summarize-customer-rentals";

function rental(overrides: Partial<CustomerRental>): CustomerRental {
  return {
    id: "r",
    reference: "RNT-1",
    status: "completed",
    vehiclePlate: "NCR 1842",
    vehicleName: "Vios",
    startAt: "2026-09-01T00:00:00Z",
    expectedReturnAt: "2026-09-03T00:00:00Z",
    actualReturnAt: "2026-09-03T00:00:00Z",
    quotedTotal: 4000,
    collected: 4000,
    penalties: 0,
    ...overrides,
  };
}

describe("customer rental summary", () => {
  it("owes quote plus unpaid penalties, never below zero, never for cancellations", () => {
    expect(rentalOutstanding(rental({ penalties: 500 }))).toBe(500);
    expect(rentalOutstanding(rental({ collected: 5000 }))).toBe(0);
    expect(rentalOutstanding(rental({ status: "cancelled", collected: 0 }))).toBe(0);
    expect(rentalOutstanding(rental({ status: "reserved", collected: 1200 }))).toBe(0);
  });

  it("allows an hour's grace before a return is late", () => {
    expect(isLateReturn(rental({ actualReturnAt: "2026-09-03T00:59:00Z" }))).toBe(false);
    expect(isLateReturn(rental({ actualReturnAt: "2026-09-03T01:01:00Z" }))).toBe(true);
    expect(isLateReturn(rental({ status: "active", actualReturnAt: null }))).toBe(false);
  });

  it("summarizes the track record", () => {
    const summary = summarizeCustomerRentals([
      rental({ id: "a", startAt: "2026-08-01T00:00:00Z", expectedReturnAt: "2026-08-05T00:00:00Z", actualReturnAt: "2026-08-05T05:00:00Z" }),
      rental({ id: "b", collected: 1200, quotedTotal: 4000 }),
      rental({ id: "c", status: "cancelled", collected: 0 }),
    ]);
    expect(summary).toMatchObject({
      rentals: 2,
      cancellations: 1,
      lifetimeValue: 5200,
      outstanding: 2800,
      lateReturns: 1,
      firstRentalAt: "2026-08-01T00:00:00Z",
      lastRentalAt: "2026-09-01T00:00:00Z",
    });
    expect(summary.averageDays).toBe(3.1);
  });

  it("handles a customer with no rentals", () => {
    expect(summarizeCustomerRentals([])).toMatchObject({ rentals: 0, averageDays: null, firstRentalAt: null });
  });
});
