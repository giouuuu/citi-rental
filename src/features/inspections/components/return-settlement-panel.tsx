"use client";

import { ClockAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ReturnPaymentMethod } from "@/features/inspections/hooks/use-inspection-form-state";
import type {
  LateReturn,
  ReturnSettlement,
} from "@/features/inspections/lib/return-settlement";
import { describeBilledTime } from "@/features/rentals/lib/rent-pricing";
import { formatManila } from "@/features/shared/lib/manila-time";
import { formatPhpExact } from "@/features/shared/lib/money";

export const RETURN_PAYMENT_METHODS: { value: ReturnPaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "gcash", label: "GCash" },
  { value: "maya", label: "Maya" },
  { value: "bank", label: "Bank" },
  { value: "other", label: "Other" },
];

/** "1 day 3 hours" */
export function describeLateness(hoursLate: number) {
  return describeBilledTime({ days: Math.floor(hoursLate / 24), hours: hoursLate % 24 });
}

export type ReturnSettlementControls = {
  late: LateReturn | null;
  lateChargeAmount: string;
  lateChargeWaived: boolean;
  lateChargeNote: string;
  onLateChargeAmount: (value: string) => void;
  onLateChargeWaived: (value: boolean) => void;
  onLateChargeNote: (value: string) => void;
  /** Rent plus charges on the bill before this return. */
  billTotal: number;
  paid: number;
  settlement: ReturnSettlement;
  paymentAmount: string;
  paymentMethod: ReturnPaymentMethod;
  paymentReference: string;
  onPaymentAmount: (value: string) => void;
  onPaymentMethod: (value: ReturnPaymentMethod) => void;
  onPaymentReference: (value: string) => void;
};

/** Return sign-off: the overdue notice and its penalty. */
export function LateReturnSection({ settle }: { settle: ReturnSettlementControls }) {
  const { late } = settle;
  if (!late) return null;
  const suggested = String(late.suggested);

  return (
    <section className="space-y-3">
      <Alert variant="destructive">
        <ClockAlert />
        <AlertTitle>
          This car is {describeLateness(late.hoursLate)} past its return date
        </AlertTitle>
        <AlertDescription>
          It was due back {formatManila(late.dueAt)}. The suggested penalty
          prices the extra time at this rental&apos;s rates. Enter your own
          amount or waive it.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 @md:grid-cols-2 @md:items-start">
        <Field data-disabled={settle.lateChargeWaived || undefined}>
          <FieldLabel htmlFor="late-charge">
            Late-return penalty (₱)
            {settle.lateChargeWaived ? null : (
              <span className="text-destructive"> *</span>
            )}
          </FieldLabel>
          <Input
            disabled={settle.lateChargeWaived}
            id="late-charge"
            inputMode="decimal"
            min={0}
            type="number"
            value={settle.lateChargeWaived ? "" : settle.lateChargeAmount}
            onChange={(event) => settle.onLateChargeAmount(event.target.value)}
          />
          <FieldDescription>
            Suggested {formatPhpExact(late.suggested)}
            {!settle.lateChargeWaived && settle.lateChargeAmount !== suggested ? (
              <>
                {" · "}
                <Button
                  className="h-auto p-0 text-xs"
                  type="button"
                  variant="link"
                  onClick={() => settle.onLateChargeAmount(suggested)}
                >
                  Use suggested
                </Button>
              </>
            ) : null}
          </FieldDescription>
        </Field>
        <Field data-disabled={settle.lateChargeWaived || undefined}>
          <FieldLabel htmlFor="late-charge-note">Penalty note</FieldLabel>
          <Textarea
            disabled={settle.lateChargeWaived}
            id="late-charge-note"
            maxLength={500}
            placeholder="Shown on the bill, e.g. Returned 3 hours late"
            rows={2}
            value={settle.lateChargeNote}
            onChange={(event) => settle.onLateChargeNote(event.target.value)}
          />
        </Field>
      </div>

      <label className="flex items-start gap-2.5 rounded-lg border border-border bg-card p-3 text-sm">
        <Checkbox
          checked={settle.lateChargeWaived}
          onCheckedChange={(value) => settle.onLateChargeWaived(value === true)}
        />
        <span>Waive the late-return penalty — nothing is added to the bill.</span>
      </label>
    </section>
  );
}

function BillRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={
        strong
          ? "flex justify-between gap-3 border-t border-border pt-2 font-semibold"
          : "flex justify-between gap-3 text-muted-foreground"
      }
    >
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

/** Return sign-off: what is owed and the payment taken at the counter. */
export function ReturnPaymentSection({ settle }: { settle: ReturnSettlementControls }) {
  const { settlement } = settle;
  const returnCharges = settlement.total - settle.billTotal;
  const settled = settlement.balanceDue <= 0;

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Settle the bill</h3>
        <p className="text-xs text-muted-foreground">
          Record what the renter pays now. It goes on the payment ledger with
          the charges above.
        </p>
      </div>

      <dl className="space-y-1.5 rounded-lg border border-border bg-card p-3 text-sm">
        <BillRow label="Bill before return" value={formatPhpExact(settle.billTotal)} />
        <BillRow label="Charges at return" value={`+ ${formatPhpExact(returnCharges)}`} />
        <BillRow label="Paid so far" value={`− ${formatPhpExact(settle.paid)}`} />
        <BillRow label="Balance due" strong value={formatPhpExact(settlement.balanceDue)} />
      </dl>

      {settled ? (
        <p className="text-sm text-muted-foreground">
          Nothing to collect — the bill is already paid.
        </p>
      ) : (
        <>
          <div className="grid gap-4 @md:grid-cols-3 @md:items-start">
            <Field>
              <FieldLabel htmlFor="settle-amount">Payment received (₱)</FieldLabel>
              <Input
                id="settle-amount"
                inputMode="decimal"
                max={settlement.balanceDue}
                min={0}
                placeholder="0.00"
                step="0.01"
                type="number"
                value={settle.paymentAmount}
                onChange={(event) => settle.onPaymentAmount(event.target.value)}
              />
              <FieldDescription>
                <Button
                  className="h-auto p-0 text-xs"
                  type="button"
                  variant="link"
                  onClick={() => settle.onPaymentAmount(String(settlement.balanceDue))}
                >
                  Pay full balance
                </Button>
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="settle-method">Method</FieldLabel>
              <Combobox
                id="settle-method"
                options={RETURN_PAYMENT_METHODS}
                value={settle.paymentMethod}
                onValueChange={(value) =>
                  settle.onPaymentMethod(value as ReturnPaymentMethod)
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="settle-reference">Reference (optional)</FieldLabel>
              <Input
                id="settle-reference"
                maxLength={120}
                placeholder="GCash / bank ref"
                value={settle.paymentReference}
                onChange={(event) => settle.onPaymentReference(event.target.value)}
              />
            </Field>
          </div>
          <p className="text-sm" aria-live="polite">
            {settlement.balanceAfter <= 0
              ? "This payment settles the bill in full."
              : `Balance left after this payment: ${formatPhpExact(settlement.balanceAfter)}`}
          </p>
        </>
      )}
    </section>
  );
}
