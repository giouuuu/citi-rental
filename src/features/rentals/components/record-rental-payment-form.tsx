"use client";

import { useState } from "react";
import { LoaderCircle, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { RecordRentalPaymentInput } from "@/features/rentals/actions/record-rental-payment-action";

const PAYMENT_TYPE_OPTIONS = [
  { value: "deposit", label: "Deposit" },
  { value: "balance", label: "Balance" },
  { value: "refund", label: "Refund" },
];

const PAYMENT_METHOD_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "gcash", label: "GCash" },
  { value: "maya", label: "Maya" },
  { value: "bank", label: "Bank" },
  { value: "other", label: "Other" },
];

type RecordRentalPaymentFormProps = {
  rentalId: string;
  pending: boolean;
  onSubmit: (input: RecordRentalPaymentInput) => void;
};

export function RecordRentalPaymentForm({
  rentalId,
  pending,
  onSubmit,
}: RecordRentalPaymentFormProps) {
  const [paymentType, setPaymentType] =
    useState<RecordRentalPaymentInput["paymentType"]>("balance");
  const [method, setMethod] =
    useState<RecordRentalPaymentInput["method"]>("cash");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const amountRaw = formData.get("amount");
    const externalReference = formData.get("externalReference");
    const notes = formData.get("notes");

    onSubmit({
      rentalId,
      paymentType,
      method,
      amount: typeof amountRaw === "string" ? Number(amountRaw) : Number.NaN,
      externalReference:
        typeof externalReference === "string" && externalReference.trim()
          ? externalReference.trim()
          : undefined,
      notes:
        typeof notes === "string" && notes.trim() ? notes.trim() : undefined,
    });
  }

  return (
    <form
      className="grid gap-3 rounded-lg border border-dashed border-border p-3 sm:grid-cols-2"
      onSubmit={handleSubmit}
    >
      <Field>
        <FieldLabel htmlFor="payment-type">Type</FieldLabel>
        <Combobox
          id="payment-type"
          onValueChange={(value) =>
            setPaymentType(value as RecordRentalPaymentInput["paymentType"])
          }
          options={PAYMENT_TYPE_OPTIONS}
          value={paymentType}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="payment-method">Method</FieldLabel>
        <Combobox
          id="payment-method"
          onValueChange={(value) =>
            setMethod(value as RecordRentalPaymentInput["method"])
          }
          options={PAYMENT_METHOD_OPTIONS}
          value={method}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="amount">Amount (PHP)</FieldLabel>
        <Input
          id="amount"
          min={1}
          name="amount"
          placeholder="2000"
          required
          step="0.01"
          type="number"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="externalReference">Reference (optional)</FieldLabel>
        <Input
          id="externalReference"
          name="externalReference"
          placeholder="GCash / bank ref"
        />
      </Field>
      <Field className="sm:col-span-2">
        <FieldLabel htmlFor="notes">Notes (optional)</FieldLabel>
        <Input id="notes" name="notes" placeholder="Received by, discount reason…" />
      </Field>
      <div className="sm:col-span-2">
        <Button disabled={pending} type="submit">
          {pending ? <LoaderCircle className="animate-spin" /> : <Plus />}
          Save payment entry
        </Button>
      </div>
    </form>
  );
}
