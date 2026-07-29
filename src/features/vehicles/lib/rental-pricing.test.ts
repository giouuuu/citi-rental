import { describe, expect, it } from "vitest";

import {
  formatPhp,
  quoteDeposit,
  quoteRentalTotal,
  rentalDayCount,
} from "./rental-pricing";

describe("rentalDayCount", () => {
  it("counts inclusive calendar days", () => {
    expect(rentalDayCount("2026-07-27", "2026-07-27")).toBe(1);
    expect(rentalDayCount("2026-07-27", "2026-07-29")).toBe(3);
  });

  it("handles datetime-local values", () => {
    expect(rentalDayCount("2026-07-27T09:00", "2026-07-28T18:00")).toBe(2);
  });

  it("returns null for invalid ranges", () => {
    expect(rentalDayCount(null, "2026-07-28")).toBeNull();
    expect(rentalDayCount("2026-07-29", "2026-07-28")).toBeNull();
  });
});

describe("quoteRentalTotal", () => {
  it("multiplies daily rate by days", () => {
    expect(quoteRentalTotal(2000, "2026-07-27", "2026-07-29")).toEqual({
      days: 3,
      dailyRate: 2000,
      total: 6000,
    });
  });
});

describe("quoteDeposit", () => {
  it("computes 30 percent deposit", () => {
    expect(quoteDeposit(6000, 30)).toEqual({
      percent: 30,
      deposit: 1800,
      balance: 4200,
    });
  });
});

describe("formatPhp", () => {
  it("formats PHP amounts", () => {
    expect(formatPhp(2000)).toMatch(/2,000/);
  });
});
