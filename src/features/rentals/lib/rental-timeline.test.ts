import { describe, expect, it } from "vitest";

import {
  buildRentalTimeline,
  previewRentalTimeline,
  rentalTimelineTrigger,
  type RentalTimelineEvent,
  type RentalTimelineInput,
  type RentalTimelineNotification,
  type RentalTimelinePayment,
} from "./rental-timeline";

const rental: RentalTimelineInput["rental"] = {
  status: "reserved",
  bookingSource: "public_web",
  createdAt: "2026-10-01T02:00:00Z",
  createdByName: null,
  startAt: "2026-10-10T01:00:00Z",
  expectedReturnAt: "2026-10-12T01:00:00Z",
  cancelledAt: null,
};

const now = new Date("2026-10-05T00:00:00Z");

function payment(
  overrides: Partial<RentalTimelinePayment>,
): RentalTimelinePayment {
  return {
    id: "p1",
    paymentType: "deposit",
    amount: 500,
    status: "confirmed",
    method: "gcash",
    chargeTypeName: null,
    notes: null,
    submittedAt: "2026-10-01T02:05:00Z",
    confirmedAt: "2026-10-01T05:00:00Z",
    confirmedByName: "Owner",
    rejectedAt: null,
    rejectedByName: null,
    updatedAt: "2026-10-01T05:00:00Z",
    ...overrides,
  };
}

describe("buildRentalTimeline", () => {
  it("tells an online booking's story in order, then what is coming", () => {
    const events = buildRentalTimeline({
      rental,
      now,
      payments: [payment({})],
      audit: [
        {
          id: "a1",
          action: "rental.transitioned",
          createdAt: "2026-10-01T05:00:01Z",
          actorName: "Owner",
          oldData: null,
          newData: { status: "reserved" },
          metadata: {},
        },
      ],
    });

    expect(events.map((event) => event.title)).toEqual([
      "Booked online by the customer",
      "Reservation fee submitted — ₱500.00",
      "Reservation fee confirmed — ₱500.00",
      "Reserved",
      "Pickup scheduled",
      "Return due",
    ]);
    expect(events[1]).toMatchObject({ detail: "GCash", actor: null });
    expect(events[2]).toMatchObject({ actor: "Owner", tone: "success" });
    expect(events.at(-1)).toMatchObject({ upcoming: true });
  });

  it("shows a staff-recorded payment as one event", () => {
    const events = buildRentalTimeline({
      rental: { ...rental, bookingSource: "ops", createdByName: "Admin" },
      now,
      audit: [],
      payments: [
        payment({
          method: "cash",
          submittedAt: "2026-10-01T03:00:00Z",
          confirmedAt: "2026-10-01T03:00:00Z",
        }),
      ],
    });
    expect(events[0]).toMatchObject({
      title: "Rental created",
      actor: "Admin",
    });
    expect(events[1]).toMatchObject({
      title: "Reservation fee recorded — ₱500.00",
      actor: "Owner",
    });
    expect(events.filter((event) => event.kind === "payment")).toHaveLength(1);
  });

  it("explains a cancellation, including the kept reservation fee", () => {
    const [, cancelled] = buildRentalTimeline({
      rental: { ...rental, status: "cancelled" },
      now,
      payments: [],
      audit: [
        {
          id: "a1",
          action: "rental.transitioned",
          createdAt: "2026-10-09T20:00:00Z",
          actorName: "Owner",
          oldData: null,
          newData: {
            status: "cancelled",
            cancellation_reason: "other",
            cancellation_note: "Flight moved",
            deposit_paid: 500,
            reservation_fee_forfeited: true,
          },
          metadata: {},
        },
      ],
    });
    expect(cancelled).toMatchObject({
      title: "Cancelled",
      tone: "danger",
      detail:
        "Flight moved · Past the cancellation limit — ₱500.00 reservation fee not refunded",
    });
  });

  it("calls a later return on an active rental an extension", () => {
    const events = buildRentalTimeline({
      rental: { ...rental, status: "active" },
      now,
      payments: [],
      audit: [
        {
          id: "a1",
          action: "rental.rescheduled",
          createdAt: "2026-10-11T00:00:00Z",
          actorName: "Owner",
          oldData: {
            start_at: rental.startAt,
            expected_return_at: "2026-10-12T01:00:00Z",
          },
          newData: {
            start_at: rental.startAt,
            expected_return_at: "2026-10-13T01:00:00Z",
          },
          metadata: { status: "active" },
        },
      ],
    });
    const extended = events.find((event) => event.kind === "rescheduled");
    expect(extended?.title).toBe("Rental extended");
    expect(extended?.detail).toMatch(
      /^Return Oct 12, 2026, 9:00.AM → Oct 13, 2026, 9:00.AM$/,
    );
  });

  it("marks automatic overdue sweeps as having no actor", () => {
    const events = buildRentalTimeline({
      rental: { ...rental, status: "overdue" },
      now,
      payments: [],
      audit: [
        {
          id: "a1",
          action: "rental.marked_overdue",
          createdAt: "2026-10-12T02:00:00Z",
          actorName: "Owner",
          oldData: null,
          newData: { status: "overdue" },
          metadata: { source: "sweep" },
        },
      ],
    });
    expect(events.find((event) => event.kind === "overdue")).toMatchObject({
      actor: null,
      tone: "warning",
    });
  });

  it("falls back to cancelled_at for rentals cancelled before audit logging", () => {
    const events = buildRentalTimeline({
      rental: {
        ...rental,
        status: "cancelled",
        cancelledAt: "2026-10-02T00:00:00Z",
      },
      now,
      audit: [],
      payments: [],
    });
    expect(events.map((event) => event.title)).toEqual([
      "Booked online by the customer",
      "Cancelled",
    ]);
  });

  it("shows customer emails: sent, retrying, given up, and skipped", () => {
    const note = (
      overrides: Partial<RentalTimelineNotification>,
    ): RentalTimelineNotification => ({
      id: "n1",
      kind: "booking_confirmed",
      status: "sent",
      recipient: "maria@example.com",
      attempts: 1,
      lastError: null,
      createdAt: "2026-10-01T05:00:00Z",
      lastAttemptAt: "2026-10-01T05:00:02Z",
      sentAt: "2026-10-01T05:00:03Z",
      ...overrides,
    });
    const events = buildRentalTimeline({
      rental,
      now,
      audit: [],
      payments: [],
      notifications: [
        note({}),
        note({
          id: "n2",
          kind: "deposit_confirmed",
          status: "failed",
          attempts: 2,
          lastError: "Resend 503: unavailable",
          sentAt: null,
        }),
        note({
          id: "n3",
          kind: "booking_reminder",
          status: "failed",
          attempts: 5,
          lastError: "Resend 422: invalid to address",
          sentAt: null,
        }),
        note({
          id: "n4",
          status: "skipped",
          recipient: null,
          lastError: "No email address on file for this customer.",
          sentAt: null,
        }),
      ],
    });
    const emails = events.filter((event) => event.kind === "email");
    expect(emails.map((event) => [event.title, event.tone])).toEqual([
      ["Reservation fee receipt failed — retrying", "warning"],
      ["Pickup reminder failed", "danger"],
      ["Confirmation email not sent", "warning"],
      ["Confirmation email sent", "default"],
    ]);
    expect(emails[3].detail).toBe("To maria@example.com");
    expect(emails[2].detail).toBe(
      "No email address on file for this customer.",
    );
  });
});

describe("previewRentalTimeline", () => {
  const event = (id: string, upcoming = false): RentalTimelineEvent => ({
    id,
    at: "2026-10-01T00:00:00Z",
    kind: upcoming ? "upcoming" : "status",
    title: id,
    actor: null,
    tone: upcoming ? "muted" : "default",
    upcoming,
  });

  it("keeps the latest past steps and the next upcoming one", () => {
    const events = [
      event("a"),
      event("b"),
      event("c"),
      event("d"),
      event("e"),
      event("pickup", true),
      event("return", true),
    ];
    expect(previewRentalTimeline(events).map((e) => e.id)).toEqual([
      "c",
      "d",
      "e",
      "pickup",
    ]);
  });

  it("shows the last four when nothing is coming up", () => {
    const events = ["a", "b", "c", "d", "e"].map((id) => event(id));
    expect(previewRentalTimeline(events).map((e) => e.id)).toEqual([
      "b",
      "c",
      "d",
      "e",
    ]);
  });

  it("returns everything when the history is short", () => {
    const events = [event("a"), event("pickup", true)];
    expect(previewRentalTimeline(events)).toEqual(events);
  });
});

describe("rentalTimelineTrigger", () => {
  it("names staff, then the customer or system, then scheduled steps", () => {
    const events = buildRentalTimeline({
      rental,
      audit: [],
      payments: [payment({ status: "submitted", confirmedAt: null })],
      now,
    });
    expect(events.map(rentalTimelineTrigger)).toEqual([
      "By the customer, online",
      "By the customer",
      "Scheduled",
      "Scheduled",
    ]);
  });
});
