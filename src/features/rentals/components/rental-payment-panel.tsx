"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banknote, Plus } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { recordRentalPaymentAction } from "@/features/rentals/actions/record-rental-payment-action";
import type { RecordRentalPaymentInput } from "@/features/rentals/actions/record-rental-payment-action";
import { RecordRentalPaymentForm } from "@/features/rentals/components/record-rental-payment-form";
import { RentalPaymentHistoryList } from "@/features/rentals/components/rental-payment-history-list";
import type { RentalPayment } from "@/features/rentals/types/rental-payment";
import { formatPhp } from "@/features/vehicles/lib/rental-pricing";
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";
import { toast } from "sonner";

type RentalPaymentPanelProps = {
  rentalId: string;
  paymentStatus?: string | null;
  quotedTotal?: number | null;
  depositAmount?: number | null;
  balanceDue?: number | null;
  depositPercent?: number | null;
  payments: RentalPayment[];
};

export function RentalPaymentPanel({
  rentalId,
  paymentStatus,
  quotedTotal,
  depositAmount,
  balanceDue,
  depositPercent,
  payments,
}: RentalPaymentPanelProps) {
  const [error, setError] = useState("");
  const [showRecord, setShowRecord] = useState(false);
  const { isPending, runMutation } = useMutationCoordinator();
  const router = useRouter();

  function recordPayment(input: RecordRentalPaymentInput) {
    runMutation(async () => {
      const result = await recordRentalPaymentAction(input);
      if (result.success) {
        setError("");
        setShowRecord(false);
        toast.success("Payment recorded.");
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
            <Banknote className="size-4" />
          </span>
          <div className="min-w-0 flex-1 space-y-3">
            <p className="text-sm font-semibold text-brand-950">
              Payment summary
            </p>
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-medium capitalize text-brand-950">
                  {(paymentStatus ?? "unpaid").replaceAll("_", " ")}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Quoted total</dt>
                <dd className="font-medium tabular-nums text-brand-950">
                  {quotedTotal != null ? formatPhp(Number(quotedTotal)) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  Deposit
                  {depositPercent != null ? ` (${depositPercent}%)` : ""}
                </dt>
                <dd className="font-medium tabular-nums text-brand-950">
                  {depositAmount != null
                    ? formatPhp(Number(depositAmount))
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Balance due</dt>
                <dd className="font-medium tabular-nums text-brand-950">
                  {balanceDue != null ? formatPhp(Number(balanceDue)) : "—"}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-brand-950">
            Payment history
          </p>
          <Button
            onClick={() => setShowRecord((value) => !value)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Plus />
            Record payment
          </Button>
        </div>

        {payments.length === 0 ? (
          <Empty className="border border-dashed border-border py-8">
            <EmptyHeader>
              <EmptyTitle>No payments yet</EmptyTitle>
              <EmptyDescription>
                Customer uploads and staff-recorded payments will show here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <RentalPaymentHistoryList payments={payments} />
        )}

        {showRecord ? (
          <RecordRentalPaymentForm
            onSubmit={recordPayment}
            pending={isPending}
            rentalId={rentalId}
          />
        ) : null}

        {error ? (
          <Alert className="py-2" variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}
