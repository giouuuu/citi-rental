import { describe, expect, it } from "vitest";

import {
  billedHours,
  describeBilledTime,
  describeRent,
  quoteRent,
  quoteRentForHours,
} from "./rent-pricing";

const rates = { daily: 1350, halfDay: 900, hourly: 150 };
const at = (value: string) => new Date(`${value}:00+08:00`);

describe("quoteRent", () => {
  it("bills whole days at the daily rate", () => {
    const quote = quoteRent(at("2026-10-01T09:00"), at("2026-10-09T09:00"), rates);
    expect(quote).toMatchObject({ days: 8, hours: 0, total: 10800 });
  });

  it("bills a few leftover hours hourly", () => {
    expect(quoteRentForHours(3 * 24 + 2, rates)).toMatchObject({
      days: 3,
      hours: 2,
      leftover: { kind: "hourly", hours: 2, amount: 300 },
      total: 4350,
    });
  });

  it("switches to the 12-hour rate when it is cheaper", () => {
    expect(quoteRentForHours(3 * 24 + 10, rates)).toMatchObject({
      leftover: { kind: "half_day", amount: 900 },
      total: 4950,
    });
  });

  it("never charges more than one more day for leftover hours", () => {
    expect(quoteRentForHours(3 * 24 + 15, rates)).toMatchObject({
      leftover: { kind: "day", amount: 1350 },
      total: 5400,
    });
  });

  it("uses 12-hour plus hourly past 12 hours when that is cheapest", () => {
    expect(quoteRentForHours(13, { daily: 2000, halfDay: 900, hourly: 150 })).toMatchObject({
      leftover: { kind: "half_day_plus_hours", extraHours: 1, amount: 1050 },
      total: 1050,
    });
  });

  it("falls back to a full day when the car has only a daily rate", () => {
    expect(quoteRentForHours(5, { daily: 1350 })).toMatchObject({
      leftover: { kind: "day" },
      total: 1350,
    });
  });

  it("rounds part of an hour up", () => {
    expect(billedHours(at("2026-10-01T09:00"), at("2026-10-01T10:10"))).toBe(2);
    expect(billedHours(at("2026-10-01T09:00"), at("2026-10-01T09:00"))).toBeNull();
  });
});

describe("describeRent", () => {
  it("lists each priced part", () => {
    expect(describeRent(quoteRentForHours(3 * 24 + 2, rates), rates)).toBe(
      "₱1,350.00 × 3 days + 2 hours × ₱150.00",
    );
    expect(describeRent(quoteRentForHours(3 * 24 + 15, rates), rates)).toBe(
      "₱1,350.00 × 4 days",
    );
    expect(describeRent(quoteRentForHours(10, rates), rates)).toBe("12-hour ₱900.00");
  });

  it("names the billed time", () => {
    expect(describeBilledTime({ days: 3, hours: 23 })).toBe("3 days 23 hours");
    expect(describeBilledTime({ days: 1, hours: 0 })).toBe("1 day");
  });
});
