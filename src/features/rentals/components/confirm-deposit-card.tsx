"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, LoaderCircle, Receipt } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { confirmRentalDepositAction } from "@/features/rentals/actions/confirm-rental-deposit-action";
import { formatPhp } from "@/features/vehicles/lib/rental-pricing";
import { ConfirmActionDialog } from "@/features/shared/components/confirm-action-dialog";
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";
import { toast } from "sonner";

type ConfirmDepositCardProps = {
  rentalId: string;
  depositAmount?: number | null;
  /** What the renter says they sent; the fee, or more up to the whole bill. */
  amountSent?: number | null;
  billTotal?: number | null;
  paymentReference?: string | null;
  proofUrl?: string | null;
  /** The deposit was paid through PayMongo, which verified the money. */
  paidOnline?: boolean;
  customerLabel?: string | null;
  /** Staff reserved the booking before the fee came in. */
  reserved?: boolean;
};

export function ConfirmDepositCard({
  rentalId,
  depositAmount,
  amountSent = null,
  billTotal = null,
  paymentReference,
  proofUrl,
  paidOnline = false,
  customerLabel,
  reserved = false,
}: ConfirmDepositCardProps) {
  const [error, setError] = useState("");
  const { isPending, runMutation } = useMutationCoordinator();
  const router = useRouter();
  const sent = amountSent ?? depositAmount ?? null;
  const paysMore = sent != null && depositAmount != null && sent > depositAmount;
  const paysAll = paysMore && billTotal != null && sent >= billTotal;

  function confirmDeposit() {
    const data = new FormData();
    data.set("id", rentalId);
    runMutation(async () => {
      const result = await confirmRentalDepositAction(data);
      if (result.success) {
        setError("");
        toast.success("Deposit confirmed.");
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
              Deposit needs confirmation
            </CardTitle>
            <CardDescription className="text-amber-950/70">
              {reserved
                ? "The booking is already reserved. Review the payment proof, then confirm the fee was received."
                : "Review the payment proof, then confirm to reserve this booking."}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <dl className="grid gap-2 sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">
              {paysMore ? "Amount sent" : "Deposit"}
            </dt>
            <dd className="font-semibold tabular-nums text-brand-950">
              {sent != null ? formatPhp(Number(sent)) : "—"}
            </dd>
            {paysMore ? (
              <dd className="text-xs text-muted-foreground">
                {paysAll ? "Full payment" : "Fee and part of the rest"} · fee{" "}
                {formatPhp(Number(depositAmount))}
              </dd>
            ) : null}
          </div>
          <div>
            <dt className="text-muted-foreground">Payment ref</dt>
            <dd className="font-medium text-brand-950">
              {paymentReference || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Customer</dt>
            <dd className="font-medium text-brand-950">
              {customerLabel || "—"}
            </dd>
          </div>
        </dl>
        {paidOnline ? (
          <p className="font-medium text-success">
            Paid online via PayMongo — the amount is verified. Confirm to
            reserve the car.
          </p>
        ) : proofUrl ? (
          <div className="space-y-1">
            <a
              className="inline-flex text-sm font-medium text-teal-700 underline-offset-2 hover:underline"
              href={proofUrl}
              rel="noreferrer"
              target="_blank"
            >
              View payment proof
            </a>
            {paysMore && sent != null ? (
              <p className="text-muted-foreground">
                The renter typed this amount. Check the screenshot shows{" "}
                {formatPhp(Number(sent))} before you confirm.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-muted-foreground">
            No proof file linked yet — confirm only if you verified payment
            offline.
          </p>
        )}
        {error ? (
          <Alert className="py-2" variant="destructive">
            <AlertTitle>Could not confirm</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
      <CardFooter>
        <ConfirmActionDialog
          confirmLabel="Confirm deposit"
          description={`Confirm the deposit${
            depositAmount != null ? ` of ${formatPhp(Number(depositAmount))}` : ""
          } was received.${
            reserved ? "" : " This reserves the car for the booked dates."
          }`}
          icon={CheckCircle2}
          title="Confirm the deposit was received?"
          trigger={
            <Button disabled={isPending} type="button">
              {isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <CheckCircle2 />
              )}
              {reserved ? "Confirm deposit" : "Confirm deposit → reserve"}
            </Button>
          }
          variant="default"
          onConfirm={confirmDeposit}
        />
      </CardFooter>
    </Card>
  );
}
