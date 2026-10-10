import { describe, expect, it } from "vitest";

import {
  driverDays,
  formatPhp,
  quoteRentalTotal,
  quoteReservationFee,
  quoteTrip,
} from "./rental-pricing";

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

describe("quoteReservationFee", () => {
  it("asks for the flat fee", () => {
    expect(quoteReservationFee(6000, 500)).toEqual({
      deposit: 500,
      balance: 5500,
    });
  });

  it("never asks for more than the trip", () => {
    expect(quoteReservationFee(300, 500)).toEqual({
      deposit: 300,
      balance: 0,
    });
  });
});

describe("formatPhp", () => {
  it("formats PHP amounts", () => {
    expect(formatPhp(2000)).toMatch(/2,000/);
  });
});

describe("driverDays", () => {
  const at = (iso: string) => new Date(iso);
  it("bills every started 24 hours, at least one", () => {
    expect(driverDays(at("2026-07-27T09:00:00Z"), at("2026-07-28T09:00:00Z"))).toBe(1);
    expect(driverDays(at("2026-07-27T09:00:00Z"), at("2026-07-28T10:00:00Z"))).toBe(2);
    expect(driverDays(at("2026-07-27T09:00:00Z"), at("2026-07-27T12:00:00Z"))).toBe(1);
  });
});

describe("quoteTrip", () => {
  it("is the rent alone when self-drive", () => {
    expect(quoteTrip(rates, "2026-07-27", "2026-07-29")).toMatchObject({
      driver: null,
      total: 4000,
    });
  });

  it("adds the driver's day rate for each driver day", () => {
    expect(
      quoteTrip(rates, "2026-07-27T09:00", "2026-07-28T11:00", { rate: 1000 }),
    ).toMatchObject({
      rent: { total: 2400 },
      driver: { days: 2, rate: 1000, fee: 2000 },
      total: 4400,
    });
  });

  it("adds nothing for a driver with no rate set", () => {
    expect(
      quoteTrip(rates, "2026-07-27", "2026-07-29", { rate: null }),
    ).toMatchObject({ driver: { days: 2, fee: 0 }, total: 4000 });
  });

  it("is null without both dates", () => {
    expect(quoteTrip(rates, "2026-07-27", "", { rate: 1000 })).toBeNull();
  });
});

