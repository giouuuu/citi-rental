"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { extendRentalAction } from "@/features/rentals/actions/rental-charge-actions";
import { describeBilledTime, type RentRates } from "@/features/rentals/lib/rent-pricing";
import { extensionCharge } from "@/features/rentals/lib/rental-quote";
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";
import {
  manilaDateTimeInput,
  parseManilaDateTimeInput,
} from "@/features/shared/lib/manila-time";
import { formatPhpExact } from "@/features/shared/lib/money";

function suggestedCharge(amount: number | undefined) {
  return amount ? String(amount) : "";
}

/** Starts from the current return, so the dialog remounts it on each open. */
function ExtendRentalForm({
  rentalId,
  startAt,
  expectedReturnAt,
  rates,
  onDone,
}: {
  rentalId: string;
  startAt: string;
  expectedReturnAt: string;
  rates: RentRates | null;
  onDone: () => void;
}) {
  const [newReturn, setNewReturn] = useState(() =>
    manilaDateTimeInput(new Date(expectedReturnAt)),
  );
  const [amount, setAmount] = useState("");
  const [amountEdited, setAmountEdited] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const { isPending, runMutation } = useMutationCoordinator();

  const parsedReturn = parseManilaDateTimeInput(newReturn);
  const priceFor = (newReturnAt: Date) =>
    rates ? extensionCharge(new Date(startAt), new Date(expectedReturnAt), newReturnAt, rates) : null;
  const extension = parsedReturn ? priceFor(parsedReturn) : null;

  function changeReturn(value: string) {
    setNewReturn(value);
    const parsed = parseManilaDateTimeInput(value);
    // Keep the suggested charge in step with the date until staff type their own.
    if (!amountEdited && parsed) {
      setAmount(suggestedCharge(priceFor(parsed)?.amount));
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runMutation(async () => {
      const result = await extendRentalAction({
        rentalId,
        newReturnAt: newReturn,
        chargeAmount: amount ? Number(amount) : undefined,
        notes: notes.trim() || undefined,
      });
      if (result.success) {
        toast.success(
          Number(amount) > 0
            ? "Rental extended and the charge added to the bill."
            : "Rental extended.",
        );
        onDone();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      {error ? (
        <Alert className="py-2" variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Field>
        <FieldLabel htmlFor="extend-return">New return</FieldLabel>
        <DateTimePicker
          id="extend-return"
          onValueChange={changeReturn}
          required
          value={newReturn}
        />
        <FieldDescription>
          Blocked if it runs into the car&apos;s next booking.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="extend-amount">Extension charge (PHP)</FieldLabel>
        <Input
          id="extend-amount"
          inputMode="decimal"
          min={0}
          onChange={(event) => {
            setAmount(event.target.value);
            setAmountEdited(true);
          }}
          placeholder="0"
          step="0.01"
          type="number"
          value={amount}
        />
        <FieldDescription>
          {extension && extension.amount > 0
            ? `${describeBilledTime(extension.next)} instead of ${describeBilledTime(extension.current)}: ${formatPhpExact(extension.amount)} more rent. Change it if you agreed another amount.`
            : "Leave blank to move the date without a charge."}
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="extend-notes">Note (optional)</FieldLabel>
        <Input
          id="extend-notes"
          maxLength={500}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Customer called to extend"
          value={notes}
        />
      </Field>
      <DialogFooter>
        <Button disabled={isPending || !parsedReturn} type="submit">
          {isPending ? <LoaderCircle className="animate-spin" /> : <CalendarPlus />}
          Extend rental
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ExtendRentalDialog({
  rentalId,
  startAt,
  expectedReturnAt,
  rates,
}: {
  rentalId: string;
  startAt: string;
  expectedReturnAt: string;
  rates: RentRates | null;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button data-tour="extend-rental" type="button" variant="outline">
          <CalendarPlus />
          Extend
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Extend rental</DialogTitle>
          <DialogDescription>
            Move the return date. The extension charge is added to the bill.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <ExtendRentalForm
            rates={rates}
            expectedReturnAt={expectedReturnAt}
            onDone={() => {
              setOpen(false);
              router.refresh();
            }}
            rentalId={rentalId}
            startAt={startAt}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
