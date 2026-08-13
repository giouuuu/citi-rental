import type { RentalWorkflowStatus } from "@/features/rentals/lib/booking-gates";

export type OverdueCandidate = {
  status: RentalWorkflowStatus | string;
  expectedReturnAt: string | Date | null | undefined;
};

/**
 * True when a rental is past its expected return and still out.
 *
 * The stored `overdue` status is set by the sweep RPC (sweep_overdue_rentals),
 * but a rental whose customer was blocked after pickup can never be swept — the
 * booking-rule trigger rejects the update. Deriving overdue here as well keeps
 * those rentals visible instead of silently reading as `active` forever.
 */
export function isRentalOverdue(
  rental: OverdueCandidate,
  now: Date = new Date(),
): boolean {
  if (rental.status === "overdue") return true;
  if (rental.status !== "active") return false;
  if (!rental.expectedReturnAt) return false;

  const due = new Date(rental.expectedReturnAt).getTime();
  if (!Number.isFinite(due)) return false;

  return due < now.getTime();
}

/** Hours a rental is past due, or 0 when it is not overdue. */
export function overdueHours(
  rental: OverdueCandidate,
  now: Date = new Date(),
): number {
  if (!rental.expectedReturnAt) return 0;
  const due = new Date(rental.expectedReturnAt).getTime();
  if (!Number.isFinite(due)) return 0;

  const elapsed = now.getTime() - due;
  return elapsed > 0 ? Math.floor(elapsed / 3_600_000) : 0;
}
