"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Receipt, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { reviewCustomerPaymentAction } from "@/features/rentals/actions/review-customer-payment-action";
import type { RentalPayment } from "@/features/rentals/types/rental-payment";
import { ConfirmActionDialog } from "@/features/shared/components/confirm-action-dialog";
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";
import { formatManila } from "@/features/shared/lib/manila-time";
import { formatPhpExact } from "@/features/shared/lib/money";

/** Bill payments the customer sent from the pay page, waiting for staff. */
export function PendingCustomerPaymentsCard({
  payments,
  balance,
}: {
  payments: RentalPayment[];
  /** Open balance before these payments count. */
  balance: number;
}) {
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const { isPending, runMutation } = useMutationCoordinator();
  const router = useRouter();

  function review(payment: RentalPayment, approve: boolean) {
    setError("");
    runMutation(async () => {
      const result = await reviewCustomerPaymentAction({
        paymentId: payment.id,
        approve,
        reason: approve ? undefined : reason,
      });
      if (result.success) {
        setError("");
        setReason("");
        toast.success(
          approve
            ? `${formatPhpExact(payment.amount)} payment confirmed.`
            : "Payment rejected. The customer sees it as not accepted.",
        );
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <Card className="border-amber-200 bg-amber-50/60 shadow-none">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
            <Receipt className="size-4" />
          </span>
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base text-brand-950">
              {payments.length === 1
                ? "Customer payment needs confirmation"
                : `${payments.length} customer payments need confirmation`}
            </CardTitle>
            <CardDescription className="text-amber-950/70">
              Sent from the pay page toward the open balance of{" "}
              {formatPhpExact(balance)}. Check each proof, then confirm or
              reject it.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="text-sm">
        <ul className="divide-y divide-amber-200/70">
          {payments.map((payment) => (
            <li
              className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
              key={payment.id}
            >
              <div className="min-w-0 space-y-0.5">
                <p className="font-semibold tabular-nums text-brand-950">
                  {formatPhpExact(payment.amount)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[
                    formatManila(payment.submittedAt, "stamp"),
                    payment.externalReference
                      ? `Ref ${payment.externalReference}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {payment.proofUrl ? (
                  <a
                    className="inline-flex text-sm font-medium text-teal-700 underline-offset-2 hover:underline"
                    href={payment.proofUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    View payment proof
                  </a>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <ConfirmActionDialog
                  confirmLabel="Reject payment"
                  description="It stays in the history as not accepted and does not count toward the bill. Tell the customer why."
                  error={error}
                  icon={XCircle}
                  onConfirm={() => review(payment, false)}
                  title={`Reject the ${formatPhpExact(payment.amount)} payment?`}
                  trigger={
                    <Button
                      disabled={isPending}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <XCircle />
                      Reject
                    </Button>
                  }
                >
                  <Field>
                    <FieldLabel htmlFor={`reject-reason-${payment.id}`}>
                      Reason (optional)
                    </FieldLabel>
                    <Textarea
                      id={`reject-reason-${payment.id}`}
                      maxLength={500}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="e.g. Amount not received in GCash"
                      value={reason}
                    />
                  </Field>
                </ConfirmActionDialog>
                <ConfirmActionDialog
                  confirmLabel="Confirm payment"
                  description={`Confirm ${formatPhpExact(payment.amount)} was received. It comes off the open balance.`}
                  error={error}
                  icon={CheckCircle2}
                  onConfirm={() => review(payment, true)}
                  title="Confirm the payment was received?"
                  trigger={
                    <Button disabled={isPending} size="sm" type="button">
                      <CheckCircle2 />
                      Confirm
                    </Button>
                  }
                  variant="default"
                />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
