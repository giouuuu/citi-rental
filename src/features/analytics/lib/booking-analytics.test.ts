import { describe, expect, it } from "vitest";

import type { BookingRow } from "@/features/analytics/types/analytics";
import { buildDemoWorkspace } from "@/features/shared/lib/demo-workspace";

import {
  bookingTrend,
  cancelNoticeMix,
  cancelReasonMix,
  cancelStage,
  channelSegments,
  leadTimeMix,
  pickupLocationMix,
  pickupWeekdayMix,
  summarizeBookings,
} from "./booking-analytics";
import { demoBookingRows } from "./demo-analytics";

const FROM = "2026-10-01";
const TO = "2026-10-10";

function row(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    rentalId: overrides.rentalId ?? "r1",
    referenceNumber: "WEB-1",
    status: "reserved",
    bookingSource: "public_web",
    withDriver: false,
    paymentStatus: "deposit_paid",
    // Oct 5, 10:00 Manila
    createdAt: "2026-10-05T02:00:00Z",
    startAt: "2026-10-12T01:00:00Z",
    expectedReturnAt: "2026-10-14T01:00:00Z",
    actualReturnAt: null,
    customerId: "c1",
    customerName: "Ana",
    customerPhone: null,
    vehicleId: "v1",
    vehiclePlate: "ABC 123",
    vehicleName: "Vios",
    vehicleCategory: "Sedan",
    pickupLocation: "Mactan Airport",
    destination: null,
    quotedTotal: 5000,
    depositAmount: 1000,
    paid: 1000,
    refunded: 0,
    firstProofAt: "2026-10-05T03:00:00Z",
    firstPaidAt: "2026-10-05T04:00:00Z",
    cancelledAt: null,
    cancellationReason: null,
    cancellationNote: null,
    reservationFeeForfeited: null,
    cancelledBy: null,
    paidBeforeCancel: 0,
    proofBeforeCancel: false,
    ...overrides,
  };
}

const unpaidCancel = row({
  rentalId: "r2",
  status: "cancelled",
  paid: 0,
  firstProofAt: null,
  firstPaidAt: null,
  cancelledAt: "2026-10-05T02:30:00Z",
  cancellationReason: "customer_request",
  cancelledBy: "customer",
});
const pendingCancel = row({
  rentalId: "r3",
  status: "cancelled",
  paid: 0,
  firstPaidAt: null,
  cancelledAt: "2026-10-06T02:00:00Z",
  cancellationReason: "vehicle_unavailable",
  cancelledBy: "staff",
  proofBeforeCancel: true,
});
const paidCancel = row({
  rentalId: "r4",
  status: "cancelled",
  paid: 1000,
  cancelledAt: "2026-10-11T12:00:00Z", // Oct 11 Manila: outside the window
  cancellationReason: "duplicate",
  cancelledBy: "staff",
  paidBeforeCancel: 1000,
  proofBeforeCancel: true,
  reservationFeeForfeited: true,
});
// Made last month, cancelled inside the window.
const oldBookingCancelled = row({
  rentalId: "r5",
  status: "cancelled",
  createdAt: "2026-09-20T02:00:00Z",
  paid: -1000, // refund recorded against a deposit never confirmed
  refunded: 1000,
  firstPaidAt: null,
  cancelledAt: "2026-10-08T02:00:00Z",
  cancellationReason: null,
  cancelledBy: "customer",
  proofBeforeCancel: true,
});

describe("cancelStage", () => {
  it("reads where the money stood when the booking was cancelled", () => {
    expect(cancelStage(unpaidCancel)).toBe("before_payment");
    expect(cancelStage(pendingCancel)).toBe("payment_pending");
    expect(cancelStage(paidCancel)).toBe("after_payment");
  });
});

describe("summarizeBookings", () => {
  const rows = [row(), unpaidCancel, pendingCancel, paidCancel, oldBookingCancelled];
  const summary = summarizeBookings(rows, FROM, TO);

  it("counts the cohort by creation date and cancellations by cancellation date", () => {
    expect(summary.booked).toBe(4);
    expect(summary.cancelledOfBooked).toBe(3);
    expect(summary.cancelRate).toBe(75);
    // r2 + r3 + r5 were cancelled inside the window; r4 was cancelled after it.
    expect(summary.cancellations).toBe(3);
  });

  it("splits cancellations by payment stage and by who cancelled", () => {
    expect(summary.cancelledBeforePayment).toBe(1);
    expect(summary.cancelledPaymentPending).toBe(2);
    expect(summary.cancelledAfterPayment).toBe(0);
    expect(summary.cancelledByCustomer).toBe(2);
    expect(summary.cancelledByStaff).toBe(1);
  });

  it("never reports a negative amount kept", () => {
    expect(summary.keptFromCancellations).toBe(0);
    expect(summary.refundedOnCancellations).toBe(1000);
    expect(summary.lostValue).toBe(15000);
  });

  it("values only bookings that were not cancelled", () => {
    expect(summary.bookedValue).toBe(5000);
    expect(summary.feePaid).toBe(2);
    expect(summary.paymentSent).toBe(3);
  });

  it("has no rates when nothing was booked", () => {
    const empty = summarizeBookings([], FROM, TO);
    expect(empty.cancelRate).toBeNull();
    expect(empty.avgLeadDays).toBeNull();
    expect(empty.medianHoursToCancel).toBeNull();
  });
});

describe("breakdowns", () => {
  it("keeps every bucket in the trend, even empty ones", () => {
    const trend = bookingTrend([row(), unpaidCancel], FROM, TO, "day");
    expect(trend).toHaveLength(10);
    expect(trend.find((point) => point.bucketStart === "2026-10-05")).toMatchObject({ booked: 2, cancelled: 1 });
  });

  it("ranks reasons and labels unrecorded ones", () => {
    const reasons = cancelReasonMix([unpaidCancel, pendingCancel, oldBookingCancelled, { ...unpaidCancel, rentalId: "x" }]);
    expect(reasons[0]).toMatchObject({ key: "customer_request", value: 2 });
    expect(reasons.map((item) => item.label)).toContain("Not recorded");
  });

  it("buckets notice before pickup, with no-shows after the pickup time", () => {
    const late = { ...unpaidCancel, cancelledAt: "2026-10-12T02:00:00Z" };
    const notice = cancelNoticeMix([unpaidCancel, late]);
    expect(notice.find((item) => item.key === "after")?.value).toBe(1);
    expect(notice.find((item) => item.key === "3to7d")?.value).toBe(1);
  });

  it("measures lead time and pickup day in Manila days", () => {
    // Booked 11 PM Manila Oct 5, picked up 7 AM Manila Oct 6: one day ahead.
    const nextMorning = row({ createdAt: "2026-10-05T15:00:00Z", startAt: "2026-10-05T23:00:00Z" });
    expect(leadTimeMix([nextMorning]).find((item) => item.key === "1to3")?.value).toBe(1);
    // Oct 6, 2026 is a Tuesday.
    expect(pickupWeekdayMix([nextMorning]).find((item) => item.label === "Tuesday")?.value).toBe(1);
  });

  it("groups typed pickup spots case-insensitively and folds the tail", () => {
    const spots = ["Airport", "airport ", "Hotel", "SM", "IT Park", "Ayala", "Port", "Lahug"].map(
      (pickupLocation, index) => row({ rentalId: String(index), pickupLocation }),
    );
    const mix = pickupLocationMix(spots, 4);
    expect(mix[0]).toMatchObject({ label: "Airport", value: 2 });
    expect(mix).toHaveLength(4);
    expect(mix.at(-1)).toMatchObject({ key: "__other", value: 4 });
  });

  it("splits the cohort by channel and by service", () => {
    const segments = channelSegments([row(), row({ rentalId: "o", bookingSource: "ops", withDriver: true })]);
    expect(segments.map((segment) => segment.booked)).toEqual([1, 1, 1, 1]);
  });
});

describe("demo booking rows", () => {
  it("agrees with the window: every row was made or cancelled in it", () => {
    const now = new Date("2026-09-29T04:00:00Z");
    const rows = demoBookingRows(buildDemoWorkspace(now), "2026-08-31", "2026-09-29");
    const summary = summarizeBookings(rows, "2026-08-31", "2026-09-29");
    expect(rows.length).toBeGreaterThan(0);
    expect(summary.booked + summary.cancellations).toBeGreaterThanOrEqual(rows.length);
  });
});
