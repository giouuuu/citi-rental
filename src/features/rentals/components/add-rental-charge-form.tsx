"use client";

import { useState } from "react";
import { LoaderCircle, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { AddRentalChargeInput } from "@/features/rentals/actions/rental-charge-actions";
import type { RentalChargeType } from "@/features/rentals/types/rental-payment";
import { formatPhpExact } from "@/features/shared/lib/money";

export function AddRentalChargeForm({
  rentalId,
  chargeTypes,
  pending,
  onSubmit,
}: {
  rentalId: string;
  chargeTypes: RentalChargeType[];
  pending: boolean;
  onSubmit: (input: AddRentalChargeInput) => void;
}) {
  const [chargeTypeId, setChargeTypeId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [cost, setCost] = useState("");

  const charged = Number(amount);
  const paidOut = Number(cost);
  const kept =
    amount && cost && Number.isFinite(charged) && Number.isFinite(paidOut)
      ? Math.round((charged - paidOut) * 100) / 100
      : null;

  function chooseType(value: string) {
    setChargeTypeId(value);
    const defaultAmount = chargeTypes.find((type) => type.id === value)?.defaultAmount;
    // A type's default fills an empty amount; never overwrite what staff typed.
    if (defaultAmount != null && !amount) setAmount(String(defaultAmount));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({
      rentalId,
      chargeTypeId,
      amount: amount ? Number(amount) : Number.NaN,
      notes: notes.trim() || undefined,
      cost: cost ? Number(cost) : undefined,
    });
  }

  return (
    <form
      className="grid items-start gap-3 rounded-lg border border-dashed border-border p-3 sm:grid-cols-2"
      onSubmit={handleSubmit}
    >
      <Field>
        <FieldLabel htmlFor="charge-type">Charge</FieldLabel>
        <Combobox
          id="charge-type"
          onValueChange={chooseType}
          options={chargeTypes.map((type) => ({ value: type.id, label: type.name }))}
          placeholder="Choose a charge"
          value={chargeTypeId}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="charge-amount">Charged to renter (PHP)</FieldLabel>
        <Input
          id="charge-amount"
          inputMode="decimal"
          min={0.01}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="500"
          required
          step="0.01"
          type="number"
          value={amount}
        />
      </Field>
      <Field className="sm:col-span-2">
        <FieldLabel htmlFor="charge-cost">Cost you paid (optional)</FieldLabel>
        <Input
          id="charge-cost"
          inputMode="decimal"
          min={0}
          onChange={(event) => setCost(event.target.value)}
          placeholder="300"
          step="0.01"
          type="number"
          value={cost}
        />
        <FieldDescription>
          {kept != null
            ? `You keep ${kept < 0 ? `− ${formatPhpExact(Math.abs(kept))}` : formatPhpExact(kept)}. `
            : "What it cost you, e.g. paid to the delivery driver. "}
          Saved as an expense in Finance. The renter never sees it.
        </FieldDescription>
      </Field>
      <Field className="sm:col-span-2">
        <FieldLabel htmlFor="charge-notes">Note (optional)</FieldLabel>
        <Input
          id="charge-notes"
          maxLength={500}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Fuel 1/4 short, Mactan airport drop-off…"
          value={notes}
        />
        <FieldDescription>Shows on the bill under the charge.</FieldDescription>
      </Field>
      <div className="sm:col-span-2">
        <Button disabled={pending || !chargeTypeId} type="submit">
          {pending ? <LoaderCircle className="animate-spin" /> : <Plus />}
          Add to bill
        </Button>
      </div>
    </form>
  );
}
