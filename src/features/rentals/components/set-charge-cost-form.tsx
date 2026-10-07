"use client";

import { useState } from "react";
import { LoaderCircle, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { SetRentalChargeCostInput } from "@/features/rentals/actions/rental-charge-actions";
import { formatPhpExact } from "@/features/shared/lib/money";

/** Sets or changes what one charge cost the business; blank or 0 clears it. */
export function SetChargeCostForm({
  paymentId,
  chargeName,
  chargeAmount,
  currentCost,
  pending,
  onSubmit,
}: {
  paymentId: string;
  chargeName: string;
  chargeAmount: number;
  currentCost: number | null;
  pending: boolean;
  onSubmit: (input: SetRentalChargeCostInput) => void;
}) {
  const [cost, setCost] = useState(currentCost != null ? String(currentCost) : "");

  const paidOut = Number(cost || 0);
  const kept = Number.isFinite(paidOut)
    ? Math.round((chargeAmount - paidOut) * 100) / 100
    : null;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ paymentId, cost: cost ? Number(cost) : 0 });
  }

  return (
    <form
      className="grid items-start gap-3 rounded-lg border border-dashed border-border p-3 sm:grid-cols-2"
      onSubmit={handleSubmit}
    >
      <Field>
        <FieldLabel htmlFor="charge-cost-edit">
          Cost of {chargeName} ({formatPhpExact(chargeAmount)})
        </FieldLabel>
        <Input
          autoFocus
          id="charge-cost-edit"
          inputMode="decimal"
          min={0}
          onChange={(event) => setCost(event.target.value)}
          placeholder="300"
          step="0.01"
          type="number"
          value={cost}
        />
        <FieldDescription>
          {kept != null && paidOut > 0
            ? `You keep ${kept < 0 ? `− ${formatPhpExact(Math.abs(kept))}` : formatPhpExact(kept)}. `
            : ""}
          {currentCost != null
            ? "Leave it blank to remove the cost and its expense."
            : "Saved as an expense in Finance. The renter never sees it."}
        </FieldDescription>
      </Field>
      <div className="flex flex-col gap-2">
        {/* Label-height spacer keeps the button level with the input. */}
        <FieldLabel aria-hidden className="invisible hidden sm:block">
          Save
        </FieldLabel>
        <Button className="w-fit" disabled={pending} type="submit">
          {pending ? <LoaderCircle className="animate-spin" /> : <Save />}
          {currentCost != null && !cost ? "Remove cost" : "Save cost"}
        </Button>
      </div>
    </form>
  );
}
