"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, LoaderCircle, Save } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { recordLoanPaymentAction } from "@/features/finance/actions/vehicle-loan-actions";
import type { Installment } from "@/features/finance/lib/loan-schedule";
import { PAYMENT_METHODS } from "@/features/finance/schemas/expense-definition";
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";
import { formatDateKey, formatPhpExact } from "@/features/shared/client";

export type LoanPaymentTarget = {
  loanId: string;
  lenderName: string;
  termMonths: number;
  installment: Pick<Installment, "number" | "dueDate" | "principal" | "interest">;
};

/**
 * Marks one installment paid. The split is prefilled from the schedule and
 * stays editable, because the bank's statement is the source of truth.
 */
export function RecordLoanPaymentDialog({
  target,
  today,
  onOpenChange,
}: {
  /** The installment being paid; null keeps the dialog closed. */
  target: LoanPaymentTarget | null;
  today: string;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={target !== null}>
      <DialogContent className="sm:max-w-lg">
        {target ? (
          <PaymentForm
            key={`${target.loanId}-${target.installment.number}`}
            onDone={() => onOpenChange(false)}
            target={target}
            today={today}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PaymentForm({
  target,
  today,
  onDone,
}: {
  target: LoanPaymentTarget;
  today: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const { isPending, runMutation } = useMutationCoordinator();
  const [principal, setPrincipal] = useState(String(target.installment.principal));
  const [interest, setInterest] = useState(String(target.installment.interest));
  const [method, setMethod] = useState("bank");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const total = (Number(principal) || 0) + (Number(interest) || 0);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    runMutation(async () => {
      const result = await recordLoanPaymentAction({
        loanId: target.loanId,
        installmentNumber: target.installment.number,
        paidOn: String(data.get("paidOn") ?? ""),
        principal,
        interest,
        paymentMethod: method,
        reference: String(data.get("reference") ?? ""),
        notes: String(data.get("notes") ?? ""),
      });
      if (!result.success) {
        setError(result.message);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      toast.success(`Installment ${target.installment.number} recorded.`);
      onDone();
      router.refresh();
    });
  }

  const fieldError = (name: string) =>
    fieldErrors[name]?.length ? <FieldError>{fieldErrors[name][0]}</FieldError> : null;

  return (
    <form className="grid gap-4" noValidate onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>
          Record installment {target.installment.number} of {target.termMonths}
        </DialogTitle>
        <DialogDescription>
          {target.lenderName}, due {formatDateKey(target.installment.dueDate)}. The interest is booked as this
          car&apos;s expense; the principal pays down the loan.
        </DialogDescription>
      </DialogHeader>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Unable to record</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup className="grid items-start gap-4 sm:grid-cols-2">
        <Field data-invalid={Boolean(fieldErrors.paidOn) || undefined}>
          <FieldLabel htmlFor="loan-paid-on">Paid on</FieldLabel>
          <DatePicker
            aria-invalid={Boolean(fieldErrors.paidOn) || undefined}
            defaultValue={today}
            id="loan-paid-on"
            max={today}
            name="paidOn"
            required
          />
          {fieldError("paidOn")}
        </Field>
        <Field>
          <FieldLabel htmlFor="loan-method">Paid by</FieldLabel>
          <Combobox id="loan-method" onValueChange={setMethod} options={PAYMENT_METHODS} value={method} />
        </Field>
        <Field data-invalid={Boolean(fieldErrors.principal) || undefined}>
          <FieldLabel htmlFor="loan-principal">Principal (PHP)</FieldLabel>
          <Input
            id="loan-principal"
            min={0}
            onChange={(event) => setPrincipal(event.target.value)}
            step="0.01"
            type="number"
            value={principal}
          />
          {fieldError("principal")}
        </Field>
        <Field data-invalid={Boolean(fieldErrors.interest) || undefined}>
          <FieldLabel htmlFor="loan-interest">Interest (PHP)</FieldLabel>
          <Input
            id="loan-interest"
            min={0}
            onChange={(event) => setInterest(event.target.value)}
            step="0.01"
            type="number"
            value={interest}
          />
          {fieldError("interest")}
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="loan-reference">Receipt or reference number</FieldLabel>
          <Input id="loan-reference" maxLength={80} name="reference" placeholder="OR-000123" />
          <FieldDescription>Without one, the interest is flagged as missing its document.</FieldDescription>
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="loan-notes">Notes</FieldLabel>
          <Input id="loan-notes" maxLength={2000} name="notes" placeholder="Paid with a late charge, etc." />
        </Field>
      </FieldGroup>

      <DialogFooter className="items-center sm:justify-between">
        <p aria-live="polite" className="text-sm text-muted-foreground">
          Total paid <span className="font-semibold text-foreground tabular-nums">{formatPhpExact(total)}</span>
        </p>
        <Button disabled={isPending} type="submit">
          {isPending ? <LoaderCircle className="animate-spin" /> : <Save />}
          {isPending ? "Saving…" : "Record payment"}
        </Button>
      </DialogFooter>
    </form>
  );
}
