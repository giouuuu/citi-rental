import { describe, expect, it } from "vitest";

import { cancellationOutcome } from "./cancellation-policy";

const NOW = new Date("2026-10-10T04:00:00.000Z");

describe("cancelling a booking", () => {
  it("refunds nothing when nothing was paid", () => {
    expect(
      cancellationOutcome({
        paymentStatus: "unpaid",
        startAt: "2026-10-10T08:00:00.000Z",
        freeCancellationHours: 24,
        now: NOW,
      }),
    ).toBe("nothing-paid");
  });

  it("keeps a paid fee inside the window before pickup", () => {
    expect(
      cancellationOutcome({
        paymentStatus: "deposit_paid",
        startAt: "2026-10-11T03:59:00.000Z",
        freeCancellationHours: 24,
        now: NOW,
      }),
    ).toBe("forfeited");
  });

  it("counts a sent payment proof as paid", () => {
    expect(
      cancellationOutcome({
        paymentStatus: "proof_submitted",
        startAt: "2026-10-10T20:00:00.000Z",
        freeCancellationHours: 24,
        now: NOW,
      }),
    ).toBe("forfeited");
  });

  it("refunds a paid fee cancelled before the window", () => {
    expect(
      cancellationOutcome({
        paymentStatus: "deposit_paid",
        startAt: "2026-10-11T04:01:00.000Z",
        freeCancellationHours: 24,
        now: NOW,
      }),
    ).toBe("refundable");
  });

  it("falls back to 24 hours when the setting is missing", () => {
    expect(
      cancellationOutcome({
        paymentStatus: "deposit_paid",
        startAt: "2026-10-11T03:00:00.000Z",
        freeCancellationHours: null,
        now: NOW,
      }),
    ).toBe("forfeited");
  });
});
