import { describe, expect, it } from "vitest";

import { isRentalOverdue, overdueHours } from "./overdue";

const NOW = new Date("2026-08-10T12:00:00.000Z");

describe("isRentalOverdue", () => {
  it("flags an active rental past its expected return", () => {
    expect(
      isRentalOverdue(
        { status: "active", expectedReturnAt: "2026-08-09T12:00:00.000Z" },
        NOW,
      ),
    ).toBe(true);
  });

  it("does not flag an active rental that is still within its window", () => {
    expect(
      isRentalOverdue(
        { status: "active", expectedReturnAt: "2026-08-11T12:00:00.000Z" },
        NOW,
      ),
    ).toBe(false);
  });

  it("treats the exact due moment as not yet overdue", () => {
    expect(
      isRentalOverdue(
        { status: "active", expectedReturnAt: NOW.toISOString() },
        NOW,
      ),
    ).toBe(false);
  });

  it("keeps a stored overdue rental overdue regardless of dates", () => {
    expect(
      isRentalOverdue(
        { status: "overdue", expectedReturnAt: "2026-09-01T12:00:00.000Z" },
        NOW,
      ),
    ).toBe(true);
  });

  it("never flags completed or cancelled rentals", () => {
    const past = "2026-01-01T00:00:00.000Z";
    expect(isRentalOverdue({ status: "completed", expectedReturnAt: past }, NOW)).toBe(
      false,
    );
    expect(isRentalOverdue({ status: "cancelled", expectedReturnAt: past }, NOW)).toBe(
      false,
    );
    expect(isRentalOverdue({ status: "reserved", expectedReturnAt: past }, NOW)).toBe(
      false,
    );
    expect(isRentalOverdue({ status: "draft", expectedReturnAt: past }, NOW)).toBe(
      false,
    );
  });

  it("is safe with a missing or unparseable expected return", () => {
    expect(isRentalOverdue({ status: "active", expectedReturnAt: null }, NOW)).toBe(
      false,
    );
    expect(
      isRentalOverdue({ status: "active", expectedReturnAt: "not a date" }, NOW),
    ).toBe(false);
  });
});

describe("overdueHours", () => {
  it("counts whole hours past the expected return", () => {
    expect(
      overdueHours(
        { status: "active", expectedReturnAt: "2026-08-10T09:30:00.000Z" },
        NOW,
      ),
    ).toBe(2);
  });

  it("returns 0 for a rental that is not yet due", () => {
    expect(
      overdueHours(
        { status: "active", expectedReturnAt: "2026-08-11T12:00:00.000Z" },
        NOW,
      ),
    ).toBe(0);
  });
});
