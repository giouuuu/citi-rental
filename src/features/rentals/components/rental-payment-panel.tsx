"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banknote, Plus, Receipt, Scale, Trash2 } from "lucide-react";
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
  adjustRentalBillAction,
  setRentalChargeCostAction,
  voidRentalChargeAction,
  type AddRentalChargeInput,
  type AdjustRentalBillInput,
  type SetRentalChargeCostInput,
} from "@/features/rentals/actions/rental-charge-actions";
import { AddRentalChargeForm } from "@/features/rentals/components/add-rental-charge-form";
import { AdjustRentalBillForm } from "@/features/rentals/components/adjust-rental-bill-form";
import { RecordRentalPaymentForm } from "@/features/rentals/components/record-rental-payment-form";
import { RentalPaymentHistoryList } from "@/features/rentals/components/rental-payment-history-list";
import { SetChargeCostForm } from "@/features/rentals/components/set-charge-cost-form";
import type { BookingFeeLine } from "@/features/booking/lib/booking-fees";
import {
  buildRentalBill,
  describeRentLine,
  type RentalBillDriver,
  type RentalBillHandover,
  rentalBillStatus,
} from "@/features/rentals/lib/rental-bill";
import {
  costableLines,
  costFor,
  type RentalCosts,
  summarizeRentalCosts,
} from "@/features/rentals/lib/rental-costs";
import type { RentRates } from "@/features/rentals/lib/rent-pricing";
import { RENTAL_BILL_TOUR } from "@/features/rentals/lib/rental-tours";
import {
  BILL_ADJUSTMENT_CODE,
  type RentalChargeType,
  type RentalPayment,
} from "@/features/rentals/types/rental-payment";
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";
import { ConfirmActionDialog } from "@/features/shared/components/confirm-action-dialog";
import { ProductTour } from "@/features/shared/components/product-tour";
import { formatPhpExact } from "@/features/shared/lib/money";

type RentalPaymentPanelProps = {
  rentalId: string;
  rentalStatus: string;
  paymentStatus?: string | null;
  /** The rates this rental was quoted at; null before a rate is set. */
  quotedRates?: RentRates | null;
  quotedDays?: number | null;
  quotedHours?: number | null;
  quotedTotal?: number | null;
  /** With-driver rentals: the driver line inside the quoted total. */
  driver?: RentalBillDriver | null;
  /** Online bookings: pick-up and return, their fees inside the quoted total. */
  handover?: RentalBillHandover | null;
  /** Online bookings: fees added to every booking, inside the quoted total. */
  bookingFees?: BookingFeeLine[];
  depositAmount?: number | null;
  depositPercent?: number | null;
  payments: RentalPayment[];
  chargeTypes: RentalChargeType[];
  /** What the bill's lines cost the business, and costs tagged in Finance. Internal; not on the renter's bill. */
  costs?: RentalCosts;
  /** The payment typed on the booking form did not save; ask for it again. */
  bookingPaymentFailed?: boolean;
};

const NO_COSTS: RentalCosts = { costs: [], canOpenFinance: false };

/** ₱200.00, or − ₱100.00 when a charge cost more than it brought in. */
function formatSigned(amount: number) {
  return amount < 0
    ? `− ${formatPhpExact(Math.abs(amount))}`
    : formatPhpExact(amount);
}

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
        <p
          className={strong ? "font-semibold text-brand-950" : "text-brand-950"}
        >
          {label}
        </p>
        {detail ? (
          <p className="text-xs break-words text-muted-foreground">{detail}</p>
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
  quotedRates = null,
  quotedDays = null,
  quotedHours = null,
  quotedTotal = null,
  driver = null,
  handover = null,
  bookingFees = [],
  depositAmount,
  depositPercent,
  payments,
  chargeTypes,
  costs = NO_COSTS,
  bookingPaymentFailed = false,
}: RentalPaymentPanelProps) {
  const [error, setError] = useState("");
  const [removeError, setRemoveError] = useState("");
  // A panel, or `cost:<line key>` for the bill line whose cost is being edited.
  const [open, setOpen] = useState<
    "charge" | "adjust" | "payment" | string | null
  >(null);
  const { isPending, runMutation } = useMutationCoordinator();
  const router = useRouter();

  const bill = buildRentalBill({
    quotedRates,
    quotedDays,
    quotedHours,
    quotedTotal,
    driver,
    handover,
    bookingFees,
    payments,
  });
  const canAddCharges = rentalStatus !== "cancelled";
  const lines = costableLines(bill);
  const costSummary = summarizeRentalCosts(lines, costs.costs);
  const costLine = lines.find((line) => open === `cost:${line.key}`) ?? null;
  const costOf = (key: string) => costFor(costs.costs, key)?.amount ?? null;

  /** The receipt button and "Cost ₱300 · you keep ₱200" for one bill line. */
  function costParts(key: string, name: string, amount: number) {
    const cost = costOf(key);
    return {
      detail:
        cost != null
          ? `Cost ${formatPhpExact(cost)} · you keep ${formatSigned(amount - cost)}`
          : null,
      button: (
        <Button
          aria-label={cost != null ? `Edit cost of ${name}` : `Add cost of ${name}`}
          aria-pressed={open === `cost:${key}`}
          disabled={isPending}
          onClick={() => toggle(`cost:${key}`)}
          size="icon-xs"
          title={cost != null ? "Edit what this cost you" : "Add what this cost you"}
          type="button"
          variant="ghost"
        >
          <Receipt />
        </Button>
      ),
    };
  }

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

  function adjustBill(input: AdjustRentalBillInput) {
    runMutation(async () => {
      settle(await adjustRentalBillAction(input), "Bill adjusted.");
    });
  }

  function setChargeCost(input: SetRentalChargeCostInput) {
    runMutation(async () => {
      settle(
        await setRentalChargeCostAction(input),
        Number(input.cost) ? "Cost saved to Finance." : "Cost removed.",
      );
    });
  }

  function removeCharge(paymentId: string) {
    runMutation(async () => {
      settle(
        await voidRentalChargeAction(paymentId),
        "Charge removed.",
        setRemoveError,
      );
    });
  }

  function toggle(panel: string) {
    setError("");
    setOpen((current) => (current === panel ? null : panel));
  }

  const rentDetail =
    describeRentLine(bill.rent) ??
    (quotedTotal == null
      ? "No rate yet. Set a daily rate on the Info tab."
      : null);

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
            {canAddCharges ? (
              <Button
                data-tour="adjust-bill"
                onClick={() => toggle("adjust")}
                size="sm"
                type="button"
                variant="outline"
              >
                <Scale />
                Adjust bill
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
          {bill.driver ? (
            <BillLine
              amount={formatPhpExact(bill.driver.fee)}
              detail={
                bill.driver.rate != null && bill.driver.days != null
                  ? `${formatPhpExact(bill.driver.rate)} × ${bill.driver.days} ${bill.driver.days === 1 ? "day" : "days"}`
                  : "Customer asked for a driver. Add the driver fee as a charge."
              }
              label="Driver"
            />
          ) : null}
          {bill.handover.map((line) => {
            const cost =
              line.fee > 0 ? costParts(line.leg, line.label, line.fee) : null;
            return (
              <BillLine
                action={cost?.button}
                amount={formatPhpExact(line.fee)}
                detail={[line.detail, cost?.detail].filter(Boolean).join(" · ")}
                key={line.leg}
                label={line.label}
              />
            );
          })}
          {bill.bookingFees.map((fee) => {
            const cost = fee.chargeTypeId
              ? costParts(`fee:${fee.chargeTypeId}`, fee.name, fee.amount)
              : null;
            return (
              <BillLine
                action={cost?.button}
                amount={formatPhpExact(fee.amount)}
                detail={["Added at booking", cost?.detail].filter(Boolean).join(" · ")}
                key={fee.chargeTypeId ?? fee.name}
                label={fee.name}
              />
            );
          })}
          {bill.charges.map((charge) => {
            const isAdjustment = charge.chargeTypeCode === BILL_ADJUSTMENT_CODE;
            const name =
              charge.chargeTypeName ??
              (isAdjustment ? "Bill adjustment" : "Charge");
            const costable = lines.some((line) => line.key === charge.id);
            const cost = costable
              ? costParts(charge.id, name, charge.amount)
              : null;
            const hasCost = costOf(charge.id) != null;
            return (
              <BillLine
                action={
                  <>
                    {cost?.button}
                    <ConfirmActionDialog
                      confirmLabel={
                        isAdjustment ? "Remove adjustment" : "Remove charge"
                      }
                      description={
                        isAdjustment
                          ? "The bill goes back to what it was before this adjustment. The record is kept for history."
                          : hasCost
                            ? "It comes off the bill and the balance, and its cost is voided in Finance. The records are kept for history."
                            : "It comes off the bill and the balance. The record is kept for history."
                      }
                      error={removeError}
                      icon={Trash2}
                      onConfirm={() => removeCharge(charge.id)}
                      title={`Remove ${name}?`}
                      trigger={
                        <Button
                          aria-label={`Remove ${name}`}
                          disabled={isPending}
                          size="icon-xs"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 />
                        </Button>
                      }
                    />
                  </>
                }
                amount={
                  charge.amount < 0
                    ? `− ${formatPhpExact(Math.abs(charge.amount))}`
                    : formatPhpExact(charge.amount)
                }
                detail={
                  [charge.notes, cost?.detail].filter(Boolean).join(" · ") || null
                }
                key={charge.id}
                label={name}
              />
            );
          })}
          <Separator className="my-2" />
          <BillLine
            amount={formatPhpExact(bill.total)}
            label="Total bill"
            strong
          />
          <BillLine
            amount={
              bill.paid > 0
                ? `− ${formatPhpExact(bill.paid)}`
                : formatPhpExact(0)
            }
            label="Paid"
          />
          <BillLine
            amount={formatPhpExact(bill.balance)}
            label="Balance"
            strong
          />
          {costSummary || costs.canOpenFinance ? (
            <div className="mt-2 space-y-1 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              {costSummary && costSummary.charged > 0 ? (
                <p className="tabular-nums">
                  Charges {formatPhpExact(costSummary.charged)} · Costs paid
                  out {formatPhpExact(costSummary.costs)} ·{" "}
                  <span className="font-medium text-brand-950">
                    You keep {formatSigned(costSummary.kept)}
                  </span>
                </p>
              ) : null}
              {costSummary && costSummary.other.length > 0 ? (
                <div>
                  <p>
                    Other costs on this rental:{" "}
                    <span className="tabular-nums font-medium text-brand-950">
                      {formatPhpExact(costSummary.otherTotal)}
                    </span>
                  </p>
                  <ul className="mt-0.5 space-y-0.5">
                    {costSummary.other.map((cost) => (
                      <li
                        className="flex items-start justify-between gap-3"
                        key={cost.expenseId}
                      >
                        {costs.canOpenFinance ? (
                          <Link
                            className="min-w-0 break-words underline-offset-2 hover:text-brand-950 hover:underline"
                            href={`/finance/expenses/${cost.expenseId}`}
                          >
                            {cost.description}
                          </Link>
                        ) : (
                          <span className="min-w-0 break-words">
                            {cost.description}
                          </span>
                        )}
                        <span className="shrink-0 tabular-nums">
                          {formatPhpExact(cost.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p>
                Costs are recorded as expenses in Finance. They are not on the
                renter&apos;s bill.
                {costs.canOpenFinance ? (
                  <>
                    {" "}
                    <Link
                      className="font-medium text-brand-950 underline-offset-2 hover:underline"
                      href={`/finance/expenses/new?rental_id=${rentalId}`}
                    >
                      Add a cost in Finance
                    </Link>
                  </>
                ) : null}
              </p>
            </div>
          ) : null}
          {depositAmount != null ? (
            <p className="pt-1 text-xs text-muted-foreground">
              {depositPercent != null
                ? `Deposit asked online (${depositPercent}%)`
                : "Reservation fee asked online"}
              :{" "}
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
        {open === "adjust" ? (
          <AdjustRentalBillForm
            onSubmit={adjustBill}
            pending={isPending}
            rentalId={rentalId}
          />
        ) : null}
        {costLine ? (
          <SetChargeCostForm
            chargeAmount={costLine.amount}
            chargeName={costLine.name}
            currentCost={costOf(costLine.key)}
            key={costLine.key}
            onSubmit={(cost) =>
              setChargeCost(
                "paymentId" in costLine.target
                  ? { paymentId: costLine.target.paymentId, cost }
                  : { rentalId, line: costLine.target.line, cost },
              )
            }
            pending={isPending}
          />
        ) : null}
        {(open === "charge" || open === "adjust" || costLine) && error ? (
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
