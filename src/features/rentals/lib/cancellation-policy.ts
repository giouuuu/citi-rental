/**
 * Whether cancelling now keeps the paid reservation fee. Mirrors the check in
 * `private.transition_rental_impl` (20261014090000_cancellation_policy.sql),
 * which decides it for real when the rental is cancelled.
 */
export type CancellationOutcome =
  /** Nothing paid yet, so there is no fee to keep or refund. */
  | { kind: "no_deposit" }
  /** Cancelled with at least `freeHours` to spare: the fee is refundable. */
  | { kind: "refundable"; depositPaid: number; hoursToPickup: number }
  /** Inside the window, or after pickup: the fee is kept. */
  | { kind: "forfeited"; depositPaid: number; hoursToPickup: number };

export const DEFAULT_FREE_CANCELLATION_HOURS = 24;

export function cancellationOutcome({
  startAt,
  depositPaid,
  freeHours,
  now = new Date(),
}: {
  startAt: string | Date;
  depositPaid: number;
  freeHours: number;
  now?: Date;
}): CancellationOutcome {
  if (!(depositPaid > 0)) return { kind: "no_deposit" };
  const hoursToPickup =
    (new Date(startAt).getTime() - now.getTime()) / 3_600_000;
  return hoursToPickup >= freeHours
    ? { kind: "refundable", depositPaid, hoursToPickup }
    : { kind: "forfeited", depositPaid, hoursToPickup };
}

/** "5 hours", "1 hour", "45 minutes" — how far off pickup is, for the warning. */
export function formatHoursToPickup(hours: number): string {
  if (hours <= 0) return "pickup time has passed";
  if (hours < 1) {
    const minutes = Math.max(1, Math.floor(hours * 60));
    return `${minutes} minute${minutes === 1 ? "" : "s"} before pickup`;
  }
  const whole = Math.floor(hours);
  return `${whole} hour${whole === 1 ? "" : "s"} before pickup`;
}
