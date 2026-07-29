export type VehicleAvailabilityResult = {
  available: boolean;
  reason?: string;
  vehicle_status?: string;
  conflict?: {
    id: string;
    reference_number: string;
    status: string;
    start_at: string;
    expected_return_at: string;
  };
};

export type RentalWorkflowStatus =
  | "draft"
  | "reserved"
  | "active"
  | "completed"
  | "cancelled"
  | "overdue";

export type RentalTransitionTarget =
  | "reserved"
  | "active"
  | "completed"
  | "cancelled";

const ALLOWED_TRANSITIONS: Record<
  RentalWorkflowStatus,
  readonly RentalTransitionTarget[]
> = {
  draft: ["reserved", "active", "cancelled"],
  reserved: ["active", "cancelled"],
  active: ["completed", "cancelled"],
  overdue: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function allowedRentalTransitions(
  status: RentalWorkflowStatus,
): readonly RentalTransitionTarget[] {
  return ALLOWED_TRANSITIONS[status] ?? [];
}

export function canTransitionRental(
  from: RentalWorkflowStatus,
  to: RentalTransitionTarget,
): boolean {
  return allowedRentalTransitions(from).includes(to);
}

export function rangesOverlap(
  startA: Date | string,
  endA: Date | string,
  startB: Date | string,
  endB: Date | string,
): boolean {
  const aStart = new Date(startA).getTime();
  const aEnd = new Date(endA).getTime();
  const bStart = new Date(startB).getTime();
  const bEnd = new Date(endB).getTime();
  if (
    ![aStart, aEnd, bStart, bEnd].every((value) => Number.isFinite(value)) ||
    aEnd <= aStart ||
    bEnd <= bStart
  ) {
    return false;
  }
  // Half-open [start, end) to match Postgres tstzrange '[)'
  return aStart < bEnd && bStart < aEnd;
}

export function mapRentalDbError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "The rental could not be saved.";
  }

  const candidate = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };
  const message = [candidate.message, candidate.details, candidate.hint]
    .filter(Boolean)
    .join(" ");

  if (
    candidate.code === "23P01" ||
    /exclusion|already booked|schedule conflict/i.test(message)
  ) {
    return (
      message.match(/This vehicle is already booked[^.]+?\./)?.[0] ??
      "This vehicle is already booked for those dates. Choose another car or change the schedule."
    );
  }

  if (/maintenance or inactive|cannot be booked/i.test(message)) {
    return "That vehicle is in maintenance or inactive and cannot be booked.";
  }

  if (/Blocked customers/i.test(message)) {
    return "This customer is blocked and cannot reserve or start a rental.";
  }

  if (/tracking consent/i.test(message)) {
    return "Record GPS tracking consent before starting this rental.";
  }

  if (/Invalid rental status transition/i.test(message)) {
    return "That status change is not allowed for this rental.";
  }

  if (/cannot change after a rental leaves draft/i.test(message)) {
    return "Customer and vehicle can only be changed while the rental is still a draft.";
  }

  if (/Completed or cancelled rentals/i.test(message)) {
    return "Completed or cancelled rentals cannot change vehicle, customer, or schedule.";
  }

  return candidate.message?.trim() || "The rental could not be saved.";
}

export function parseAvailabilityResult(
  value: unknown,
): VehicleAvailabilityResult {
  if (!value || typeof value !== "object") {
    return { available: false, reason: "Could not verify vehicle availability." };
  }
  const raw = value as Record<string, unknown>;
  return {
    available: raw.available === true,
    reason: typeof raw.reason === "string" ? raw.reason : undefined,
    vehicle_status:
      typeof raw.vehicle_status === "string" ? raw.vehicle_status : undefined,
    conflict:
      raw.conflict && typeof raw.conflict === "object"
        ? (raw.conflict as VehicleAvailabilityResult["conflict"])
        : undefined,
  };
}
