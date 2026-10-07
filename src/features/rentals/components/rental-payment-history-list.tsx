import { formatManila } from "@/features/shared/lib/manila-time";
import { formatPhp } from "@/features/vehicles/lib/rental-pricing";
import type { RentalPayment } from "@/features/rentals/types/rental-payment";

const PAYMENT_TYPE_LABELS: Record<RentalPayment["paymentType"], string> = {
  deposit: "Deposit",
  balance: "Balance",
  penalty: "Charge",
  refund: "Refund",
  adjustment: "Discount / adjustment",
};

function formatWhen(value: string) {
  if (!Number.isFinite(new Date(value).getTime())) return value;
  return formatManila(value, "stamp");
}

export function RentalPaymentHistoryList({
  payments,
}: {
  payments: RentalPayment[];
}) {
  if (payments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No payment entries yet.</p>
    );
  }

  return (
    <ul className="space-y-2">
      {payments.map((payment) => (
        <li
          className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm"
          key={payment.id}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-medium text-brand-950">
                {PAYMENT_TYPE_LABELS[payment.paymentType]} · {formatPhp(payment.amount)}
              </p>
              <p className="text-xs text-muted-foreground">
                {payment.status.replaceAll("_", " ")}
                {payment.method ? ` · ${payment.method}` : ""}
                {" · "}
                {formatWhen(payment.submittedAt)}
              </p>
              {payment.externalReference ? (
                <p className="text-xs text-muted-foreground">
                  Ref: {payment.externalReference}
                </p>
              ) : null}
            </div>
            {payment.proofUrl ? (
              <a
                className="text-xs font-medium text-teal-700 underline-offset-2 hover:underline"
                href={payment.proofUrl}
                rel="noreferrer"
                target="_blank"
              >
                View proof
              </a>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
