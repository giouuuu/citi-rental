import { describe, expect, it } from "vitest";

import {
  extensionCharge,
  quoteRentalDates,
  requoteBookedTime,
} from "./rental-quote";

const rates = { daily: 1350, halfDay: 900, hourly: 150 };
const at = (value: string) => new Date(`${value}:00+08:00`);

describe("quoteRentalDates", () => {
  it("writes the snapshot rates and billed time", () => {
    expect(quoteRentalDates(at("2026-10-01T09:00"), at("2026-10-04T11:00"), rates)).toEqual({
      quoted_daily_rate: 1350,
      quoted_half_day_rate: 900,
      quoted_hourly_rate: 150,
      quoted_days: 3,
      quoted_hours: 2,
      quoted_total: 4350,
    });
  });

  it("leaves the optional rates empty when the car has none", () => {
    expect(quoteRentalDates(at("2026-10-01T09:00"), at("2026-10-03T09:00"), { daily: 1999.99 })).toMatchObject({
      quoted_half_day_rate: null,
      quoted_hourly_rate: null,
      quoted_days: 2,
      quoted_total: 3999.98,
    });
  });

  it("is null when the return is not after pick-up", () => {
    expect(quoteRentalDates(at("2026-10-01T09:00"), at("2026-10-01T09:00"), rates)).toBeNull();
  });
});

describe("requoteBookedTime", () => {
  it("re-prices the booked time at new rates", () => {
    expect(requoteBookedTime({ days: 3, hours: 2 }, { daily: 1500, hourly: 200 })).toMatchObject({
      quoted_days: 3,
      quoted_hours: 2,
      quoted_total: 4900,
    });
  });

  it("keeps calendar days on rentals quoted before elapsed-time pricing", () => {
    expect(requoteBookedTime({ days: 4, hours: null }, rates)).toEqual({
      quoted_daily_rate: 1350,
      quoted_total: 5400,
    });
  });
});

describe("extensionCharge", () => {
  const start = at("2026-10-01T09:00");
  const due = at("2026-10-03T09:00");

  it("bills a few extra hours as hours", () => {
    expect(extensionCharge(start, due, at("2026-10-03T12:00"), rates)?.amount).toBe(450);
  });

  it("bills extra whole days at the daily rate", () => {
    expect(extensionCharge(start, due, at("2026-10-05T09:00"), rates)?.amount).toBe(2700);
  });

  it("is zero when the return does not move later", () => {
    expect(extensionCharge(start, due, due, rates)?.amount).toBe(0);
  });
});
