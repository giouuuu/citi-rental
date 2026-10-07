"use client";

import { useState } from "react";
import { LoaderCircle, Scale } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { AdjustRentalBillInput } from "@/features/rentals/actions/rental-charge-actions";

const DIRECTIONS = [
  { value: "subtract", label: "Take off the bill" },
  { value: "add", label: "Add to the bill" },
];

/** Owner/admin correction to the running bill, in either direction. */
export function AdjustRentalBillForm({
  rentalId,
  pending,
  onSubmit,
}: {
  rentalId: string;
  pending: boolean;
  onSubmit: (input: AdjustRentalBillInput) => void;
}) {
  const [direction, setDirection] = useState<AdjustRentalBillInput["direction"]>("subtract");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({
      rentalId,
      direction,
      amount: amount ? Number(amount) : Number.NaN,
      reason: reason.trim(),
    });
  }

  return (
    <form
      className="grid items-start gap-3 rounded-lg border border-dashed border-border p-3 sm:grid-cols-2"
      onSubmit={handleSubmit}
    >
      <Field>
        <FieldLabel htmlFor="adjust-direction">Adjustment</FieldLabel>
        <Combobox
          id="adjust-direction"
          onValueChange={(value) =>
            setDirection(value as AdjustRentalBillInput["direction"])
          }
          options={DIRECTIONS}
          value={direction}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="adjust-amount">Amount (PHP)</FieldLabel>
        <Input
          id="adjust-amount"
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
        <FieldLabel htmlFor="adjust-reason">Reason</FieldLabel>
        <Input
          id="adjust-reason"
          maxLength={500}
          minLength={3}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Returned 2 hours early, agreed discount, rate typed wrong…"
          required
          value={reason}
        />
        <FieldDescription>
          Shows on the bill. Remove the line later to undo it.
        </FieldDescription>
      </Field>
      <div className="sm:col-span-2">
        <Button disabled={pending} type="submit">
          {pending ? <LoaderCircle className="animate-spin" /> : <Scale />}
          {direction === "subtract" ? "Take off the bill" : "Add to the bill"}
        </Button>
      </div>
    </form>
  );
}
