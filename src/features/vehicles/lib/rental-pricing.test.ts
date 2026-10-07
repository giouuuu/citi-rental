import { describe, expect, it } from "vitest";

import { formatPhp, quoteDeposit, quoteRentalTotal } from "./rental-pricing";

const rates = { daily: 2000, halfDay: 1200, hourly: 200 };

describe("quoteRentalTotal", () => {
  it("prices search days as 24-hour periods", () => {
    expect(quoteRentalTotal(rates, "2026-07-27", "2026-07-29")).toMatchObject({
      days: 2,
      hours: 0,
      total: 4000,
    });
  });

  it("prices a same-day search from 9 AM to 6 PM", () => {
    expect(quoteRentalTotal(rates, "2026-07-27", "2026-07-27")).toMatchObject({
      days: 0,
      hours: 9,
      total: 1200,
    });
  });

  it("prices picked times on elapsed hours", () => {
    expect(quoteRentalTotal(rates, "2026-07-27T09:00", "2026-07-28T11:00")).toMatchObject({
      days: 1,
      hours: 2,
      total: 2400,
    });
  });

  it("reads stored UTC timestamps", () => {
    // Oct 8 12:00 AM → Oct 9 6:00 PM in Manila: 1 day 18 hours.
    expect(
      quoteRentalTotal({ daily: 1350 }, "2026-10-07T16:00:00+00:00", "2026-10-09T10:00:00+00:00"),
    ).toMatchObject({ days: 1, hours: 18, total: 2700 });
  });

  it("is null for missing or backwards trips", () => {
    expect(quoteRentalTotal(rates, null, "2026-07-28")).toBeNull();
    expect(quoteRentalTotal(rates, "2026-07-29", "2026-07-28")).toBeNull();
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
