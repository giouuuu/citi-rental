/**
 * Which rentals hold their car's dates. Mirrors `private.rental_holds_dates`:
 * booked, out, or late — or a draft whose customer already sent the
 * reservation fee (proof upload or PayMongo), even before staff confirm it.
 */
export const HOLDING_RENTAL_STATUSES = ["reserved", "active", "overdue"];

/** Payment states that make a draft hold its dates. */
export const HOLDING_DRAFT_PAYMENT_STATUSES = [
  "proof_submitted",
  "deposit_paid",
  "paid_in_full",
];

/** PostgREST `or` filter for rentals that hold their car, plus any extra statuses. */
export function rentalHoldsDatesFilter(extraStatuses: string[] = []) {
  const statuses = [...HOLDING_RENTAL_STATUSES, ...extraStatuses].join(",");
  const paid = HOLDING_DRAFT_PAYMENT_STATUSES.join(",");
  return `status.in.(${statuses}),and(status.eq.draft,payment_status.in.(${paid}))`;
}

/** Calendar status for a rental: a paid draft shows as "held". */
export function calendarStatus(status: string) {
  return status === "draft" ? "held" : status;
}
