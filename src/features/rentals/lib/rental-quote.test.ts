import { describe, expect, it } from "vitest";

import { extensionDays, rentalBilledDays, rentalQuote } from "./rental-quote";

describe("rentalBilledDays", () => {
  it("counts Manila calendar days inclusively", () => {
    // Oct 10 09:00 → Oct 12 09:00 Manila is 3 billed days.
    expect(
      rentalBilledDays(
        new Date("2026-10-10T01:00:00.000Z"),
        new Date("2026-10-12T01:00:00.000Z"),
      ),
    ).toBe(3);
  });

  it("uses the Manila date, not UTC", () => {
    // 23:30 UTC on Oct 9 is already Oct 10 in Manila.
    expect(
      rentalBilledDays(
        new Date("2026-10-09T23:30:00.000Z"),
        new Date("2026-10-10T10:00:00.000Z"),
      ),
    ).toBe(1);
  });
});

describe("rentalQuote", () => {
  it("multiplies rate by days to the centavo", () => {
    expect(rentalQuote(1999.99, 3)).toEqual({
      quoted_daily_rate: 1999.99,
      quoted_days: 3,
      quoted_total: 5999.97,
    });
  });
});

describe("extensionDays", () => {
  const start = new Date("2026-10-10T01:00:00.000Z");
  const due = new Date("2026-10-12T01:00:00.000Z");

  it("counts the extra days the new return adds", () => {
    expect(extensionDays(start, due, new Date("2026-10-14T01:00:00.000Z"))).toBe(2);
  });

  it("is zero when the return moves later on the same day", () => {
    expect(extensionDays(start, due, new Date("2026-10-12T08:00:00.000Z"))).toBe(0);
  });
});
