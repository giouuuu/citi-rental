import { describe, expect, it } from "vitest";

import { cancellationOutcome, formatHoursToPickup } from "./cancellation-policy";

const now = new Date("2026-10-08T10:00:00+08:00");

describe("cancellationOutcome", () => {
  it("has nothing to keep when no deposit was paid", () => {
    expect(
      cancellationOutcome({
        startAt: "2026-10-08T12:00:00+08:00",
        depositPaid: 0,
        freeHours: 24,
        now,
      }),
    ).toEqual({ kind: "no_deposit" });
  });

  it("refunds when cancelled at least the window before pickup", () => {
    expect(
      cancellationOutcome({
        startAt: "2026-10-09T10:00:00+08:00",
        depositPaid: 500,
        freeHours: 24,
        now,
      }),
    ).toMatchObject({ kind: "refundable", depositPaid: 500, hoursToPickup: 24 });
  });

  it("keeps the fee inside the window", () => {
    expect(
      cancellationOutcome({
        startAt: "2026-10-09T09:00:00+08:00",
        depositPaid: 500,
        freeHours: 24,
        now,
      }),
    ).toMatchObject({ kind: "forfeited", hoursToPickup: 23 });
  });

  it("keeps the fee once pickup has passed", () => {
    expect(
      cancellationOutcome({
        startAt: "2026-10-07T10:00:00+08:00",
        depositPaid: 500,
        freeHours: 24,
        now,
      }).kind,
    ).toBe("forfeited");
  });

  it("follows the window from settings", () => {
    expect(
      cancellationOutcome({
        startAt: "2026-10-09T09:00:00+08:00",
        depositPaid: 500,
        freeHours: 12,
        now,
      }).kind,
    ).toBe("refundable");
  });
});

describe("formatHoursToPickup", () => {
  it("reads naturally", () => {
    expect(formatHoursToPickup(5.7)).toBe("5 hours before pickup");
    expect(formatHoursToPickup(1.2)).toBe("1 hour before pickup");
    expect(formatHoursToPickup(0.5)).toBe("30 minutes before pickup");
    expect(formatHoursToPickup(-2)).toBe("pickup time has passed");
  });
});
