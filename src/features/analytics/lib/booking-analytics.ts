import { percent } from "@/features/analytics/lib/analytics-metrics";
import { bucketStartOf } from "@/features/analytics/lib/analytics-window";
import { bucketLabel } from "@/features/analytics/lib/trend-series";
import type { AnalyticsBucket, BookingRow } from "@/features/analytics/types/analytics";
import { cancellationReasonLabel } from "@/features/rentals/lib/cancellation-reasons";
import { addDaysToKey, daysBetweenKeys, manilaDateKey } from "@/features/shared/lib/manila-time";

/**
 * Booking analytics from `analytics_booking_rows`. Two populations:
 *
 * - **booked**: bookings *made* in the window (the cohort). Funnel, status
 *   mix, lead time, cancellation rate, and booked value read this.
 * - **cancelled**: bookings *cancelled* in the window, whenever they were
 *   made. Cancellation counts, reasons, timing, and money read this, matching
 *   the Overview's cancellation count.
 */

const HOUR_MS = 3_600_000;
const PICKED_UP = new Set(["active", "overdue", "completed"]);

/** One bar in a breakdown chart. Plain values only — it crosses to the client. */
export type BreakdownItem = { key: string; label: string; value: number };

export type BookingSummary = {
  booked: number;
  website: number;
  frontDesk: number;
  withDriver: number;
  paymentSent: number;
  feePaid: number;
  pickedUp: number;
  completed: number;
  awaitingPayment: number;
  cancelledOfBooked: number;
  /** Share of bookings made in the window that are now cancelled. */
  cancelRate: number | null;
  /** Share of bookings made in the window with a confirmed payment. */
  paidRate: number | null;
  /** Quoted value of bookings made in the window and not cancelled. */
  bookedValue: number;
  avgBookingValue: number | null;
  avgLeadDays: number | null;
  avgTripDays: number | null;
  cancellations: number;
  cancelledBeforePayment: number;
  cancelledPaymentPending: number;
  cancelledAfterPayment: number;
  cancelledByCustomer: number;
  cancelledByStaff: number;
  feesForfeited: number;
  /** Money still held from cancelled bookings (paid, net of refunds). */
  keptFromCancellations: number;
  refundedOnCancellations: number;
  /** Quoted value of the cancelled bookings. */
  lostValue: number;
  medianHoursToCancel: number | null;
};

function inWindow(iso: string | null, from: string, to: string) {
  if (!iso) return false;
  const key = manilaDateKey(new Date(iso));
  return key >= from && key <= to;
}

function hoursBetween(from: string, to: string) {
  return (new Date(to).getTime() - new Date(from).getTime()) / HOUR_MS;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function sumOf(rows: BookingRow[], pick: (row: BookingRow) => number) {
  return round2(rows.reduce((sum, row) => sum + pick(row), 0));
}

export function bookedInWindow(rows: BookingRow[], from: string, to: string) {
  return rows.filter((row) => inWindow(row.createdAt, from, to));
}

export function cancelledInWindow(rows: BookingRow[], from: string, to: string) {
  return rows.filter((row) => row.status === "cancelled" && inWindow(row.cancelledAt, from, to));
}

export function paymentWasSent(row: BookingRow) {
  return Boolean(row.firstProofAt || row.firstPaidAt);
}

export type CancelStage = "before_payment" | "payment_pending" | "after_payment";

export const CANCEL_STAGE_LABELS: Record<CancelStage, string> = {
  before_payment: "Before any payment",
  payment_pending: "Sent, not confirmed",
  after_payment: "After payment confirmed",
};

/** Where the money stood when the booking was cancelled. */
export function cancelStage(row: BookingRow): CancelStage {
  if (row.paidBeforeCancel > 0) return "after_payment";
  if (row.proofBeforeCancel) return "payment_pending";
  return "before_payment";
}

export function summarizeBookings(rows: BookingRow[], from: string, to: string): BookingSummary {
  const booked = bookedInWindow(rows, from, to);
  const cancelled = cancelledInWindow(rows, from, to);
  const kept = booked.filter((row) => row.status !== "cancelled");
  const stages = cancelled.map(cancelStage);
  const cancelledOfBooked = booked.length - kept.length;
  const bookedValue = sumOf(kept, (row) => row.quotedTotal ?? 0);
  const priced = kept.filter((row) => row.quotedTotal !== null);
  const leadDays = average(kept.map((row) => Math.max(0, hoursBetween(row.createdAt, row.startAt) / 24)));
  const tripDays = average(kept.map((row) => Math.max(0, hoursBetween(row.startAt, row.expectedReturnAt) / 24)));
  const hoursToCancel = median(
    cancelled.map((row) => Math.max(0, hoursBetween(row.createdAt, row.cancelledAt ?? row.createdAt))),
  );

  return {
    booked: booked.length,
    website: booked.filter((row) => row.bookingSource === "public_web").length,
    frontDesk: booked.filter((row) => row.bookingSource !== "public_web").length,
    withDriver: booked.filter((row) => row.withDriver).length,
    paymentSent: booked.filter(paymentWasSent).length,
    feePaid: booked.filter((row) => row.firstPaidAt).length,
    pickedUp: booked.filter((row) => PICKED_UP.has(row.status)).length,
    completed: booked.filter((row) => row.status === "completed").length,
    awaitingPayment: booked.filter((row) => row.status === "draft").length,
    cancelledOfBooked,
    cancelRate: percent(cancelledOfBooked, booked.length),
    paidRate: percent(booked.filter((row) => row.firstPaidAt).length, booked.length),
    bookedValue,
    avgBookingValue: priced.length ? round2(sumOf(priced, (row) => row.quotedTotal ?? 0) / priced.length) : null,
    avgLeadDays: leadDays === null ? null : round1(leadDays),
    avgTripDays: tripDays === null ? null : round1(tripDays),
    cancellations: cancelled.length,
    cancelledBeforePayment: stages.filter((stage) => stage === "before_payment").length,
    cancelledPaymentPending: stages.filter((stage) => stage === "payment_pending").length,
    cancelledAfterPayment: stages.filter((stage) => stage === "after_payment").length,
    cancelledByCustomer: cancelled.filter((row) => row.cancelledBy === "customer").length,
    cancelledByStaff: cancelled.filter((row) => row.cancelledBy !== "customer").length,
    feesForfeited: cancelled.filter((row) => row.reservationFeeForfeited === true).length,
    keptFromCancellations: sumOf(cancelled, (row) => Math.max(0, row.paid)),
    refundedOnCancellations: sumOf(cancelled, (row) => row.refunded),
    lostValue: sumOf(cancelled, (row) => row.quotedTotal ?? 0),
    medianHoursToCancel: hoursToCancel === null ? null : round1(hoursToCancel),
  };
}

export type BookingTrendRow = {
  label: string;
  bucketStart: string;
  booked: number;
  cancelled: number;
};

/** Bookings made vs bookings cancelled, per bucket, with empty buckets kept. */
export function bookingTrend(
  rows: BookingRow[],
  from: string,
  to: string,
  bucket: AnalyticsBucket,
): BookingTrendRow[] {
  const points = new Map<string, BookingTrendRow>();
  for (let key = from; key <= to; key = addDaysToKey(key, 1)) {
    const start = bucketStartOf(key, bucket);
    if (!points.has(start)) {
      points.set(start, { label: bucketLabel(start, bucket), bucketStart: start, booked: 0, cancelled: 0 });
    }
  }
  const pointFor = (iso: string) => points.get(bucketStartOf(manilaDateKey(new Date(iso)), bucket));
  for (const row of bookedInWindow(rows, from, to)) {
    const point = pointFor(row.createdAt);
    if (point) point.booked += 1;
  }
  for (const row of cancelledInWindow(rows, from, to)) {
    const point = pointFor(row.cancelledAt as string);
    if (point) point.cancelled += 1;
  }
  return [...points.values()];
}

/** Counts per label, in the order given; labels not listed are left out. */
function countInto(order: { key: string; label: string }[], keys: string[]): BreakdownItem[] {
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return order.map((item) => ({ ...item, value: counts.get(item.key) ?? 0 }));
}

/** Booked → payment sent → paid → picked up → completed, for the cohort. */
export function bookingFunnel(summary: BookingSummary): BreakdownItem[] {
  return [
    { key: "booked", label: "Booked", value: summary.booked },
    { key: "sent", label: "Sent payment", value: summary.paymentSent },
    { key: "paid", label: "Payment confirmed", value: summary.feePaid },
    { key: "picked_up", label: "Picked up", value: summary.pickedUp },
    { key: "completed", label: "Returned", value: summary.completed },
  ];
}

export const BOOKING_STATUS_LABELS: Record<BookingRow["status"], string> = {
  draft: "Awaiting payment",
  reserved: "Reserved",
  active: "Released",
  overdue: "Overdue",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function statusMix(booked: BookingRow[]): BreakdownItem[] {
  return countInto(
    Object.entries(BOOKING_STATUS_LABELS).map(([key, label]) => ({ key, label })),
    booked.map((row) => row.status),
  );
}

export function cancelStageMix(cancelled: BookingRow[]): BreakdownItem[] {
  return countInto(
    Object.entries(CANCEL_STAGE_LABELS).map(([key, label]) => ({ key, label })),
    cancelled.map(cancelStage),
  );
}

export function cancelledByMix(cancelled: BookingRow[]): BreakdownItem[] {
  return countInto(
    [
      { key: "customer", label: "Customer, online" },
      { key: "staff", label: "Staff" },
    ],
    cancelled.map((row) => (row.cancelledBy === "customer" ? "customer" : "staff")),
  );
}

/** Reasons, most common first; reasons nobody used are dropped. */
export function cancelReasonMix(cancelled: BookingRow[]): BreakdownItem[] {
  const counts = new Map<string, BreakdownItem>();
  for (const row of cancelled) {
    const key = row.cancellationReason ?? "none";
    const item = counts.get(key) ?? {
      key,
      label: cancellationReasonLabel(row.cancellationReason)?.replace(" (specify)", "") ?? "Not recorded",
      value: 0,
    };
    item.value += 1;
    counts.set(key, item);
  }
  return [...counts.values()].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

/** How long before the pickup time the booking was cancelled. */
export function cancelNoticeMix(cancelled: BookingRow[]): BreakdownItem[] {
  return countInto(
    [
      { key: "after", label: "After pickup time" },
      { key: "lt24h", label: "Under 24 hours" },
      { key: "1to3d", label: "1–3 days" },
      { key: "3to7d", label: "3–7 days" },
      { key: "gt7d", label: "Over 7 days" },
    ],
    cancelled.map((row) => {
      const hours = hoursBetween(row.cancelledAt ?? row.startAt, row.startAt);
      if (hours <= 0) return "after";
      if (hours < 24) return "lt24h";
      if (hours < 72) return "1to3d";
      if (hours < 168) return "3to7d";
      return "gt7d";
    }),
  );
}

/** How soon after booking it was cancelled. */
export function cancelAfterBookingMix(cancelled: BookingRow[]): BreakdownItem[] {
  return countInto(
    [
      { key: "lt1h", label: "Within an hour" },
      { key: "lt24h", label: "1–24 hours" },
      { key: "lt7d", label: "1–7 days" },
      { key: "gt7d", label: "Over 7 days" },
    ],
    cancelled.map((row) => {
      const hours = hoursBetween(row.createdAt, row.cancelledAt ?? row.createdAt);
      if (hours < 1) return "lt1h";
      if (hours < 24) return "lt24h";
      if (hours < 168) return "lt7d";
      return "gt7d";
    }),
  );
}

/** Days between booking and pickup, by Manila calendar day. */
export function leadTimeMix(booked: BookingRow[]): BreakdownItem[] {
  return countInto(
    [
      { key: "same", label: "Same day" },
      { key: "1to3", label: "1–3 days" },
      { key: "4to7", label: "4–7 days" },
      { key: "8to14", label: "8–14 days" },
      { key: "15to30", label: "15–30 days" },
      { key: "gt30", label: "Over 30 days" },
    ],
    booked.map((row) => {
      const days =
        daysBetweenKeys(manilaDateKey(new Date(row.createdAt)), manilaDateKey(new Date(row.startAt))) - 1;
      if (days <= 0) return "same";
      if (days <= 3) return "1to3";
      if (days <= 7) return "4to7";
      if (days <= 14) return "8to14";
      if (days <= 30) return "15to30";
      return "gt30";
    }),
  );
}

export function tripLengthMix(booked: BookingRow[]): BreakdownItem[] {
  return countInto(
    [
      { key: "half", label: "12 hours or less" },
      { key: "1d", label: "Up to 1 day" },
      { key: "2to3d", label: "2–3 days" },
      { key: "4to7d", label: "4–7 days" },
      { key: "gt7d", label: "Over 7 days" },
    ],
    booked.map((row) => {
      const hours = hoursBetween(row.startAt, row.expectedReturnAt);
      if (hours <= 12) return "half";
      if (hours <= 24) return "1d";
      if (hours <= 72) return "2to3d";
      if (hours <= 168) return "4to7d";
      return "gt7d";
    }),
  );
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Pickup day of the week, Manila time, Monday first. */
export function pickupWeekdayMix(booked: BookingRow[]): BreakdownItem[] {
  return countInto(
    WEEKDAYS.map((label, index) => ({ key: String(index), label })),
    booked.map((row) => {
      const key = manilaDateKey(new Date(row.startAt));
      return String((new Date(`${key}T00:00:00.000Z`).getUTCDay() + 6) % 7);
    }),
  );
}

/** Most-used pickup spots (typed by hand, so grouped case-insensitively). */
export function pickupLocationMix(booked: BookingRow[], limit = 6): BreakdownItem[] {
  const counts = new Map<string, BreakdownItem>();
  for (const row of booked) {
    const label = row.pickupLocation?.trim().replaceAll(/\s+/g, " ") || "Not given";
    const key = label.toLowerCase();
    const item = counts.get(key) ?? { key, label, value: 0 };
    item.value += 1;
    counts.set(key, item);
  }
  const sorted = [...counts.values()].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  if (sorted.length <= limit) return sorted;
  const rest = sorted.slice(limit - 1);
  return [
    ...sorted.slice(0, limit - 1),
    { key: "__other", label: "Everywhere else", value: rest.reduce((sum, item) => sum + item.value, 0) },
  ];
}

export type BookingSegment = {
  key: string;
  label: string;
  booked: number;
  paid: number;
  cancelled: number;
  cancelRate: number | null;
  bookedValue: number;
};

function segment(key: string, label: string, rows: BookingRow[]): BookingSegment {
  const cancelled = rows.filter((row) => row.status === "cancelled").length;
  return {
    key,
    label,
    booked: rows.length,
    paid: rows.filter((row) => row.firstPaidAt).length,
    cancelled,
    cancelRate: percent(cancelled, rows.length),
    bookedValue: sumOf(
      rows.filter((row) => row.status !== "cancelled"),
      (row) => row.quotedTotal ?? 0,
    ),
  };
}

/** The cohort split by where it was booked and by service. */
export function channelSegments(booked: BookingRow[]): BookingSegment[] {
  return [
    segment("website", "Website", booked.filter((row) => row.bookingSource === "public_web")),
    segment("front_desk", "Front desk", booked.filter((row) => row.bookingSource !== "public_web")),
    segment("self_drive", "Self-drive", booked.filter((row) => !row.withDriver)),
    segment("with_driver", "With driver", booked.filter((row) => row.withDriver)),
  ];
}

export type CarSegment = BookingSegment & { plate: string; name: string | null };

/** The cohort per car, most booked first. */
export function carSegments(booked: BookingRow[]): CarSegment[] {
  const groups = new Map<string, BookingRow[]>();
  for (const row of booked) {
    const key = row.vehicleId ?? "none";
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()]
    .map(([key, rows]) => ({
      ...segment(key, rows[0].vehiclePlate ?? "No car", rows),
      plate: rows[0].vehiclePlate ?? "No car",
      name: rows[0].vehicleName,
    }))
    .sort((a, b) => b.booked - a.booked || b.bookedValue - a.bookedValue || a.plate.localeCompare(b.plate));
}
