"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banknote, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { recordRentalPaymentAction } from "@/features/rentals/actions/record-rental-payment-action";
import type { RecordRentalPaymentInput } from "@/features/rentals/actions/record-rental-payment-action";
import {
  addRentalChargeAction,
  voidRentalChargeAction,
  type AddRentalChargeInput,
} from "@/features/rentals/actions/rental-charge-actions";
import { AddRentalChargeForm } from "@/features/rentals/components/add-rental-charge-form";
import { RecordRentalPaymentForm } from "@/features/rentals/components/record-rental-payment-form";
import { RentalPaymentHistoryList } from "@/features/rentals/components/rental-payment-history-list";
import { buildRentalBill, rentalBillStatus } from "@/features/rentals/lib/rental-bill";
import { RENTAL_BILL_TOUR } from "@/features/rentals/lib/rental-tours";
import type {
  RentalChargeType,
  RentalPayment,
} from "@/features/rentals/types/rental-payment";
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";
import { ConfirmActionDialog } from "@/features/shared/components/confirm-action-dialog";
import { ProductTour } from "@/features/shared/components/product-tour";
import { formatPhpExact } from "@/features/shared/lib/money";

type RentalPaymentPanelProps = {
  rentalId: string;
  rentalStatus: string;
  paymentStatus?: string | null;
  quotedDailyRate?: number | null;
  quotedDays?: number | null;
  quotedTotal?: number | null;
  depositAmount?: number | null;
  depositPercent?: number | null;
  payments: RentalPayment[];
  chargeTypes: RentalChargeType[];
  /** The payment typed on the booking form did not save; ask for it again. */
  bookingPaymentFailed?: boolean;
};

function BillLine({
  label,
  detail,
  amount,
  action,
  strong = false,
}: {
  label: string;
  detail?: string | null;
  amount: string;
  action?: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className={strong ? "font-semibold text-brand-950" : "text-brand-950"}>
          {label}
        </p>
        {detail ? (
          <p className="truncate text-xs text-muted-foreground">{detail}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span
          className={`tabular-nums ${strong ? "font-semibold text-brand-950" : "text-brand-950"}`}
        >
          {amount}
        </span>
        {action}
      </div>
    </div>
  );
}

export function RentalPaymentPanel({
  rentalId,
  rentalStatus,
  paymentStatus,
  quotedDailyRate = null,
  quotedDays = null,
  quotedTotal = null,
  depositAmount,
  depositPercent,
  payments,
  chargeTypes,
  bookingPaymentFailed = false,
}: RentalPaymentPanelProps) {
  const [error, setError] = useState("");
  const [removeError, setRemoveError] = useState("");
  const [open, setOpen] = useState<"charge" | "payment" | null>(null);
  const { isPending, runMutation } = useMutationCoordinator();
  const router = useRouter();

  const bill = buildRentalBill({
    quotedDailyRate,
    quotedDays,
    quotedTotal,
    payments,
  });
  const canAddCharges = rentalStatus !== "cancelled";

  function settle(
    result: { success: boolean; message?: string },
    success: string,
    showError: (message: string) => void = setError,
  ) {
    if (result.success) {
      setError("");
      setRemoveError("");
      setOpen(null);
      toast.success(success);
      router.refresh();
    } else {
      showError(result.message ?? "Something went wrong.");
    }
  }

  function recordPayment(input: RecordRentalPaymentInput) {
    runMutation(async () => {
      settle(await recordRentalPaymentAction(input), "Payment recorded.");
    });
  }

  function addCharge(input: AddRentalChargeInput) {
    runMutation(async () => {
      settle(await addRentalChargeAction(input), "Charge added to the bill.");
    });
  }

  function removeCharge(paymentId: string) {
    runMutation(async () => {
      settle(await voidRentalChargeAction(paymentId), "Charge removed.", setRemoveError);
    });
  }

  function toggle(panel: "charge" | "payment") {
    setError("");
    setOpen((current) => (current === panel ? null : panel));
  }

  const rentDetail =
    bill.rent.dailyRate != null && bill.rent.days != null
      ? `${formatPhpExact(bill.rent.dailyRate)} × ${bill.rent.days} ${bill.rent.days === 1 ? "day" : "days"}`
      : quotedTotal == null
        ? "No rate yet. Set a daily rate on the Info tab."
        : null;

  return (
    <div className="space-y-5">
      {bookingPaymentFailed && bill.received.length === 0 ? (
        <Alert variant="destructive">
          <AlertDescription>
            The rental was saved, but the payment taken at booking was not
            recorded. Use Record payment below to add it.
          </AlertDescription>
        </Alert>
      ) : null}
      <div
        className="space-y-3 rounded-xl border border-border bg-card p-4"
        data-tour="rental-bill"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <Banknote className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-brand-950">Bill</p>
              <p className="text-xs text-muted-foreground">
                {rentalBillStatus(bill, paymentStatus)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ProductTour
              label="Tour"
              size="sm"
              steps={RENTAL_BILL_TOUR}
              tourKey="rental-bill"
            />
            {canAddCharges ? (
              <Button
                data-tour="add-charge"
                onClick={() => toggle("charge")}
                size="sm"
                type="button"
                variant="outline"
              >
                <Plus />
                Add charge
              </Button>
            ) : null}
          </div>
        </div>

        <div className="text-sm">
          <BillLine
            amount={formatPhpExact(bill.rent.total)}
            detail={rentDetail}
            label="Rent"
          />
          {bill.charges.map((charge) => (
            <BillLine
              action={
                <ConfirmActionDialog
                  confirmLabel="Remove charge"
                  description="It comes off the bill and the balance. The record is kept for history."
                  error={removeError}
                  icon={Trash2}
                  onConfirm={() => removeCharge(charge.id)}
                  title={`Remove ${charge.chargeTypeName ?? "this charge"}?`}
                  trigger={
                    <Button
                      aria-label={`Remove ${charge.chargeTypeName ?? "charge"}`}
                      disabled={isPending}
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 />
                    </Button>
                  }
                />
              }
              amount={formatPhpExact(charge.amount)}
              detail={charge.notes}
              key={charge.id}
              label={charge.chargeTypeName ?? "Charge"}
            />
          ))}
          <Separator className="my-2" />
          <BillLine amount={formatPhpExact(bill.total)} label="Total bill" strong />
          <BillLine
            amount={bill.paid > 0 ? `− ${formatPhpExact(bill.paid)}` : formatPhpExact(0)}
            label="Paid"
          />
          <BillLine amount={formatPhpExact(bill.balance)} label="Balance" strong />
          {depositAmount != null ? (
            <p className="pt-1 text-xs text-muted-foreground">
              Deposit asked online
              {depositPercent != null ? ` (${depositPercent}%)` : ""}:{" "}
              {formatPhpExact(Number(depositAmount))}
            </p>
          ) : null}
        </div>

        {open === "charge" ? (
          chargeTypes.length > 0 ? (
            <AddRentalChargeForm
              chargeTypes={chargeTypes}
              onSubmit={addCharge}
              pending={isPending}
              rentalId={rentalId}
            />
          ) : (
            <Empty className="border border-dashed border-border py-6">
              <EmptyHeader>
                <EmptyTitle>No charge types</EmptyTitle>
                <EmptyDescription>
                  Add car wash, delivery, and other fees in Settings → Charge
                  types.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )
        ) : null}
        {open === "charge" && error ? (
          <Alert className="py-2" variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-brand-950">
            Payment history
          </p>
          <Button
            data-tour="record-payment"
            onClick={() => toggle("payment")}
            size="sm"
            type="button"
            variant="outline"
          >
            <Plus />
            Record payment
          </Button>
        </div>

        {bill.received.length === 0 ? (
          <Empty className="border border-dashed border-border py-8">
            <EmptyHeader>
              <EmptyTitle>No payments yet</EmptyTitle>
              <EmptyDescription>
                Customer uploads and staff-recorded payments will show here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <RentalPaymentHistoryList payments={bill.received} />
        )}

        {open === "payment" ? (
          <RecordRentalPaymentForm
            onSubmit={recordPayment}
            pending={isPending}
            rentalId={rentalId}
          />
        ) : null}
        {open === "payment" && error ? (
          <Alert className="py-2" variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}
