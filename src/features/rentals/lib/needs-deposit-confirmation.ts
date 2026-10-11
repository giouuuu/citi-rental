import type { RentalPayment } from "@/features/rentals/types/rental-payment";

/** A reservation fee was sent on a draft, or on a booking staff already reserved. */
export function needsDepositConfirmation(options: {
  status: string;
  paymentStatus?: string | null;
  payments: RentalPayment[];
}): boolean {
  const { status, paymentStatus, payments } = options;
  if (status !== "draft" && status !== "reserved") return false;
  if (paymentStatus === "proof_submitted") return true;
  return payments.some(
    (payment) =>
      payment.paymentType === "deposit" && payment.status === "submitted",
  );
}
