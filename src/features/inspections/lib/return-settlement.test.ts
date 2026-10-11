import { describe, expect, it } from "vitest";
import { lateReturn, settleReturn } from "./return-settlement";

const rental = {
  startAt: "2026-10-01T09:00:00+08:00",
  expectedReturnAt: "2026-10-03T09:00:00+08:00",
  rates: { daily: 2000, halfDay: 1200, hourly: 200 },
};

describe("lateReturn", () => {
  it("is null while the car is on time", () => {
    expect(lateReturn(rental, new Date("2026-10-03T08:59:00+08:00"))).toBeNull();
    expect(lateReturn(rental, new Date("2026-10-03T09:00:00+08:00"))).toBeNull();
  });

  it("prices the extra time like an extension", () => {
    const late = lateReturn(rental, new Date("2026-10-03T11:30:00+08:00"));
    expect(late).toEqual({
      dueAt: rental.expectedReturnAt,
      hoursLate: 3,
      suggested: 600,
    });
  });

  it("caps leftover hours at the cheaper 12-hour rate", () => {
    const late = lateReturn(rental, new Date("2026-10-03T19:00:00+08:00"));
    expect(late?.hoursLate).toBe(10);
    expect(late?.suggested).toBe(1200);
  });

  it("suggests nothing when the rental has no rates", () => {
    const late = lateReturn({ ...rental, rates: null }, new Date("2026-10-04T09:00:00+08:00"));
    expect(late).toMatchObject({ hoursLate: 24, suggested: 0 });
  });
});

describe("settleReturn", () => {
  it("adds return charges and subtracts the counter payment", () => {
    expect(
      settleReturn({ billTotal: 4000, paid: 1000, charges: [600, 0, 250], payment: 2000 }),
    ).toEqual({ total: 4850, balanceDue: 3850, balanceAfter: 1850 });
  });

  it("never reads below zero", () => {
    expect(
      settleReturn({ billTotal: 4000, paid: 5000, charges: [], payment: 0 }),
    ).toEqual({ total: 4000, balanceDue: 0, balanceAfter: 0 });
  });
});
