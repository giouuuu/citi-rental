import { cancellationReasonLabel } from "@/features/rentals/lib/cancellation-reasons";
import type {
  PaymentEntryStatus,
  PaymentType,
} from "@/features/rentals/types/rental-payment";
import { formatManila } from "@/features/shared/lib/manila-time";
import { formatPhpExact } from "@/features/shared/lib/money";

/**
 * A rental's history, merged from three sources that each already record
 * their own times:
 *
 * - the rental row (created, cancelled_at for rentals that predate audit logs)
 * - `audit_logs` (status changes, inspections, overdue marks, date changes)
 * - `payments` (submitted / confirmed / rejected / voided money)
 *
 * Future pickup and return times are added as upcoming entries.
 */
export type RentalTimelineKind =
  | "created"
  | "reserved"
  | "pickup"
  | "return"
  | "overdue"
  | "rescheduled"
  | "cancelled"
  | "payment"
  | "charge"
  | "refund"
  | "status"
  | "upcoming";

export type RentalTimelineTone =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "muted";

export type RentalTimelineEvent = {
  id: string;
  at: string;
  kind: RentalTimelineKind;
  title: string;
  detail?: string;
  /** Who did it; null when automatic or unknown. */
  actor: string | null;
  tone: RentalTimelineTone;
  upcoming?: boolean;
};

export type RentalTimelineAuditEntry = {
  id: string;
  action: string;
  createdAt: string;
  actorName: string | null;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
};

export type RentalTimelinePayment = {
  id: string;
  paymentType: PaymentType;
  amount: number;
  status: PaymentEntryStatus;
  method: string | null;
  chargeTypeName: string | null;
  notes: string | null;
  submittedAt: string;
  confirmedAt: string | null;
  confirmedByName: string | null;
  rejectedAt: string | null;
  rejectedByName: string | null;
  updatedAt: string;
};

export type RentalTimelineInput = {
  rental: {
    status: string;
    bookingSource: string | null;
    createdAt: string;
    createdByName: string | null;
    startAt: string | null;
    expectedReturnAt: string | null;
    cancelledAt: string | null;
  };
  audit: RentalTimelineAuditEntry[];
  payments: RentalTimelinePayment[];
  now?: Date;
};

const PAYMENT_LABELS: Record<PaymentType, string> = {
  deposit: "Reservation fee",
  balance: "Payment",
  penalty: "Charge",
  refund: "Refund",
  adjustment: "Discount / adjustment",
};

const METHOD_LABELS: Record<string, string> = {
  gcash: "GCash",
  maya: "Maya",
  bank: "Bank transfer",
  cash: "Cash",
  paymongo: "Paid online",
  other: "Other method",
};

/** A staff-recorded payment is confirmed on the spot; a customer's waits. */
const SAME_MOMENT_MS = 60_000;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function number(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return value != null && value !== "" && Number.isFinite(parsed)
    ? parsed
    : null;
}

function when(value: unknown): string | null {
  const raw = text(value);
  return raw && Number.isFinite(new Date(raw).getTime())
    ? formatManila(raw, "stamp")
    : null;
}

function joinDetail(parts: (string | null | undefined | false)[]) {
  const kept = parts.filter((part): part is string => Boolean(part));
  return kept.length ? kept.join(" · ") : undefined;
}

function paymentEvents(payment: RentalTimelinePayment): RentalTimelineEvent[] {
  const label =
    payment.paymentType === "penalty"
      ? (payment.chargeTypeName ?? PAYMENT_LABELS.penalty)
      : PAYMENT_LABELS[payment.paymentType];
  const amount = formatPhpExact(payment.amount);
  const method = payment.method ? (METHOD_LABELS[payment.method] ?? payment.method) : null;
  const events: RentalTimelineEvent[] = [];

  if (payment.paymentType === "penalty") {
    events.push({
      id: `${payment.id}:added`,
      at: payment.submittedAt,
      kind: "charge",
      title: `${label} added — ${amount}`,
      detail: payment.notes ?? undefined,
      actor: payment.confirmedByName,
      tone: "default",
    });
  } else {
    const confirmedLater =
      payment.confirmedAt != null &&
      new Date(payment.confirmedAt).getTime() -
        new Date(payment.submittedAt).getTime() >
        SAME_MOMENT_MS;
    const awaitingReview = payment.status !== "confirmed" || confirmedLater;
    const isRefund = payment.paymentType === "refund";

    events.push({
      id: `${payment.id}:submitted`,
      at: payment.submittedAt,
      kind: isRefund ? "refund" : "payment",
      title: awaitingReview
        ? `${label} submitted — ${amount}`
        : `${label} recorded — ${amount}`,
      detail: joinDetail([method, payment.notes]),
      actor: awaitingReview ? null : payment.confirmedByName,
      tone: awaitingReview ? "default" : isRefund ? "warning" : "success",
    });

    if (confirmedLater && payment.confirmedAt) {
      events.push({
        id: `${payment.id}:confirmed`,
        at: payment.confirmedAt,
        kind: isRefund ? "refund" : "payment",
        title: `${label} confirmed — ${amount}`,
        actor: payment.confirmedByName,
        tone: isRefund ? "warning" : "success",
      });
    }
  }

  if (payment.status === "rejected") {
    events.push({
      id: `${payment.id}:rejected`,
      at: payment.rejectedAt ?? payment.updatedAt,
      kind: payment.paymentType === "penalty" ? "charge" : "payment",
      title: `${label} rejected — ${amount}`,
      actor: payment.rejectedByName,
      tone: "danger",
    });
  }

  if (payment.status === "cancelled") {
    events.push({
      id: `${payment.id}:voided`,
      at: payment.updatedAt,
      kind: payment.paymentType === "penalty" ? "charge" : "payment",
      title: `${label} voided — ${amount}`,
      actor: null,
      tone: "muted",
    });
  }

  return events;
}

function inspectionEvent(entry: RentalTimelineAuditEntry): RentalTimelineEvent {
  const data = entry.newData ?? {};
  const isPickup = data.inspection_type === "pickup";
  const odometer = number(data.odometer);
  const fuel = number(data.fuel_level);
  return {
    id: entry.id,
    at: entry.createdAt,
    kind: isPickup ? "pickup" : "return",
    title: isPickup
      ? "Car picked up — rental started"
      : "Car returned — rental completed",
    detail: joinDetail([
      `${isPickup ? "Pickup" : "Return"} inspection done`,
      odometer != null ? `Odometer ${odometer.toLocaleString("en-PH")} km` : null,
      fuel != null ? `Fuel ${fuel}%` : null,
    ]),
    actor: entry.actorName,
    tone: isPickup ? "default" : "success",
  };
}

function rescheduleEvent(entry: RentalTimelineAuditEntry): RentalTimelineEvent {
  const before = entry.oldData ?? {};
  const after = entry.newData ?? {};
  const startMoved = before.start_at !== after.start_at;
  const returnMoved = before.expected_return_at !== after.expected_return_at;
  const wasOut =
    entry.metadata?.status === "active" || entry.metadata?.status === "overdue";
  const extended =
    wasOut &&
    !startMoved &&
    returnMoved &&
    new Date(String(after.expected_return_at)).getTime() >
      new Date(String(before.expected_return_at)).getTime();

  const pickupChange = startMoved
    ? `Pickup ${when(before.start_at) ?? "—"} → ${when(after.start_at) ?? "—"}`
    : null;
  const returnChange = returnMoved
    ? `Return ${when(before.expected_return_at) ?? "—"} → ${when(after.expected_return_at) ?? "—"}`
    : null;

  return {
    id: entry.id,
    at: entry.createdAt,
    kind: "rescheduled",
    title: extended ? "Rental extended" : "Dates changed",
    detail: joinDetail([pickupChange, returnChange]),
    actor: entry.actorName,
    tone: "default",
  };
}

function cancelledDetail(data: Record<string, unknown>) {
  const reason = text(data.cancellation_reason);
  const note = text(data.cancellation_note);
  const why =
    reason === "other" && note
      ? note
      : joinDetail([cancellationReasonLabel(reason), note]);
  const forfeited = data.reservation_fee_forfeited;
  const deposit = number(data.deposit_paid);
  const fee =
    forfeited === true
      ? `Past the cancellation limit — ${deposit ? formatPhpExact(deposit) + " " : ""}reservation fee not refunded`
      : forfeited === false
        ? "Cancelled in time — reservation fee refundable"
        : null;
  return joinDetail([why, fee]);
}

const STATUS_TITLES: Record<string, string> = {
  reserved: "Reserved",
  active: "Rental started",
  completed: "Rental completed",
  overdue: "Marked overdue",
};

function auditEvent(entry: RentalTimelineAuditEntry): RentalTimelineEvent | null {
  const data = entry.newData ?? {};
  switch (entry.action) {
    case "rental.inspection_submitted":
      return inspectionEvent(entry);
    case "rental.rescheduled":
      return rescheduleEvent(entry);
    case "rental.marked_overdue": {
      const automatic = entry.metadata?.source === "sweep";
      return {
        id: entry.id,
        at: entry.createdAt,
        kind: "overdue",
        title: "Marked overdue",
        detail: automatic ? "Return time passed without a return" : undefined,
        actor: automatic ? null : entry.actorName,
        tone: "warning",
      };
    }
    case "rental.transitioned": {
      const status = text(data.status);
      if (status === "cancelled") {
        return {
          id: entry.id,
          at: entry.createdAt,
          kind: "cancelled",
          title: "Cancelled",
          detail: cancelledDetail(data),
          actor: entry.actorName,
          tone: "danger",
        };
      }
      if (!status) return null;
      return {
        id: entry.id,
        at: entry.createdAt,
        kind: status === "reserved" ? "reserved" : status === "overdue" ? "overdue" : "status",
        title: STATUS_TITLES[status] ?? `Moved to ${status}`,
        actor: entry.actorName,
        tone:
          status === "reserved" || status === "completed"
            ? "success"
            : status === "overdue"
              ? "warning"
              : "default",
      };
    }
    default:
      return null;
  }
}

const OPEN_STATUSES = new Set(["draft", "reserved", "active", "overdue"]);

export function buildRentalTimeline({
  rental,
  audit,
  payments,
  now = new Date(),
}: RentalTimelineInput): RentalTimelineEvent[] {
  const past: RentalTimelineEvent[] = [
    {
      id: "created",
      at: rental.createdAt,
      kind: "created",
      title:
        rental.bookingSource === "public_web"
          ? "Booked online by the customer"
          : "Rental created",
      actor: rental.bookingSource === "public_web" ? null : rental.createdByName,
      tone: "default",
    },
  ];

  for (const entry of audit) {
    const event = auditEvent(entry);
    if (event) past.push(event);
  }
  for (const payment of payments) past.push(...paymentEvents(payment));

  // Rentals cancelled before cancellations were audit-logged.
  if (rental.cancelledAt && !past.some((event) => event.kind === "cancelled")) {
    past.push({
      id: "cancelled",
      at: rental.cancelledAt,
      kind: "cancelled",
      title: "Cancelled",
      actor: null,
      tone: "danger",
    });
  }

  past.sort(
    (a, b) =>
      new Date(a.at).getTime() - new Date(b.at).getTime() ||
      a.id.localeCompare(b.id),
  );

  const upcoming: RentalTimelineEvent[] = [];
  if (OPEN_STATUSES.has(rental.status)) {
    const notStarted = rental.status === "draft" || rental.status === "reserved";
    if (
      notStarted &&
      rental.startAt &&
      new Date(rental.startAt).getTime() > now.getTime()
    ) {
      upcoming.push({
        id: "upcoming:pickup",
        at: rental.startAt,
        kind: "upcoming",
        title: "Pickup scheduled",
        actor: null,
        tone: "muted",
        upcoming: true,
      });
    }
    if (
      rental.expectedReturnAt &&
      new Date(rental.expectedReturnAt).getTime() > now.getTime()
    ) {
      upcoming.push({
        id: "upcoming:return",
        at: rental.expectedReturnAt,
        kind: "upcoming",
        title: "Return due",
        actor: null,
        tone: "muted",
        upcoming: true,
      });
    }
  }

  return [...past, ...upcoming];
}
