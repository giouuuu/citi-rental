import type { RentalPayment } from "@/features/rentals/types/rental-payment";

export function needsDepositConfirmation(options: {
  status: string;
  paymentStatus?: string | null;
  payments: RentalPayment[];
}): boolean {
  const { status, paymentStatus, payments } = options;
  if (status !== "draft") return false;
  if (paymentStatus === "proof_submitted") return true;
  return payments.some(
    (payment) =>
      payment.paymentType === "deposit" && payment.status === "submitted",
  );
}
