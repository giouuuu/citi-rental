/**
 * Why a rental was cancelled. Values mirror the `rentals_cancellation_reason`
 * check in `20260929102000_rental_booking_source_and_cancellation.sql`; the
 * analytics screen reads them back, so keep the two lists identical.
 */
export const CANCELLATION_REASONS = [
  { value: "customer_request", label: "Customer asked to cancel" },
  { value: "no_show", label: "Customer did not show up" },
  { value: "payment_not_received", label: "Deposit or payment not received" },
  { value: "vehicle_unavailable", label: "Vehicle became unavailable" },
  { value: "duplicate", label: "Duplicate booking" },
  { value: "other", label: "Other (specify)" },
] as const;

/** Longest specific reason staff can type; matches `rentals.cancellation_note`. */
export const CANCELLATION_NOTE_MAX = 500;

export type CancellationReason = (typeof CANCELLATION_REASONS)[number]["value"];

export const CANCELLATION_REASON_VALUES = CANCELLATION_REASONS.map(
  (reason) => reason.value,
) as [CancellationReason, ...CancellationReason[]];

export function cancellationReasonLabel(value: string | null | undefined): string | null {
  return CANCELLATION_REASONS.find((reason) => reason.value === value)?.label ?? null;
}
