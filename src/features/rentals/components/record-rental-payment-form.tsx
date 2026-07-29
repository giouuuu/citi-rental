"use client";

import { useState } from "react";
import { LoaderCircle, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RecordRentalPaymentInput } from "@/features/rentals/actions/record-rental-payment-action";

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
        <FieldLabel>Type</FieldLabel>
        <Select
          onValueChange={(value) =>
            setPaymentType(value as RecordRentalPaymentInput["paymentType"])
          }
          value={paymentType}
        >
          <SelectTrigger className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="deposit">Deposit</SelectItem>
            <SelectItem value="balance">Balance</SelectItem>
            <SelectItem value="penalty">Penalty</SelectItem>
            <SelectItem value="refund">Refund</SelectItem>
            <SelectItem value="adjustment">Adjustment</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>Method</FieldLabel>
        <Select
          onValueChange={(value) =>
            setMethod(value as RecordRentalPaymentInput["method"])
          }
          value={method}
        >
          <SelectTrigger className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="gcash">GCash</SelectItem>
            <SelectItem value="maya">Maya</SelectItem>
            <SelectItem value="bank">Bank</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
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
        <Input id="notes" name="notes" placeholder="Late return fee, etc." />
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
