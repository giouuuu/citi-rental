"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { RotateCw } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { resendRentalEmailAction } from "@/features/rentals/actions/resend-rental-email-action";
import type { RentalTimelineResend } from "@/features/rentals/lib/rental-timeline";
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";

const normalize = (value: string | null | undefined) =>
  (value ?? "").trim().toLowerCase();

/**
 * Sends a timeline email again. The address starts as the customer's saved
 * email and can be corrected; a corrected one is saved on the customer too
 * unless the owner unticks it.
 */
export function ResendEmailControl({ resend }: { resend: RentalTimelineResend }) {
  const [open, setOpen] = useState(false);
  const [recipient, setRecipient] = useState(resend.recipient ?? "");
  const [updateCustomer, setUpdateCustomer] = useState(true);
  const [fieldError, setFieldError] = useState("");
  const [formError, setFormError] = useState("");
  const { isPending, runMutation } = useMutationCoordinator();
  const router = useRouter();
  const inputId = useId();
  const checkboxId = useId();

  const changesCustomer =
    normalize(recipient) !== "" &&
    normalize(recipient) !== normalize(resend.customerEmail);

  function close() {
    setOpen(false);
    setRecipient(resend.recipient ?? "");
    setUpdateCustomer(true);
    setFieldError("");
    setFormError("");
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData();
    data.set("notificationId", resend.notificationId);
    data.set("recipient", recipient);
    data.set("updateCustomer", String(changesCustomer && updateCustomer));
    runMutation(async () => {
      const result = await resendRentalEmailAction(data);
      if (result.success) {
        toast.success(
          `Sending the ${resend.label.toLowerCase()} to ${result.data?.recipient ?? recipient.trim()}.`,
        );
        close();
        router.refresh();
        return;
      }
      const recipientError = result.fieldErrors?.recipient?.[0];
      setFieldError(recipientError ?? "");
      setFormError(recipientError ? "" : result.message);
    });
  }

  if (!open) {
    return (
      <Button
        className="mt-2"
        onClick={() => setOpen(true)}
        size="xs"
        type="button"
        variant="outline"
      >
        <RotateCw aria-hidden data-icon="inline-start" />
        Resend
      </Button>
    );
  }

  return (
    <form
      className="mt-2 flex flex-col gap-3 rounded-md border bg-muted/40 p-3"
      noValidate
      onSubmit={submit}
    >
      <Field data-invalid={fieldError ? true : undefined}>
        <FieldLabel htmlFor={inputId}>Send to</FieldLabel>
        <Input
          aria-invalid={fieldError ? true : undefined}
          autoComplete="off"
          autoFocus
          disabled={isPending}
          id={inputId}
          inputMode="email"
          onChange={(event) => {
            setRecipient(event.target.value);
            setFieldError("");
          }}
          placeholder="customer@example.com"
          type="email"
          value={recipient}
        />
        {fieldError ? (
          <FieldError>{fieldError}</FieldError>
        ) : (
          <FieldDescription>
            Fix the address here if it was typed wrong.
          </FieldDescription>
        )}
      </Field>

      {changesCustomer ? (
        <Field orientation="horizontal">
          <Checkbox
            checked={updateCustomer}
            disabled={isPending}
            id={checkboxId}
            onCheckedChange={(checked) => setUpdateCustomer(checked === true)}
          />
          <FieldLabel className="font-normal" htmlFor={checkboxId}>
            {resend.customerEmail
              ? `Also replace ${resend.customerEmail} on the customer`
              : "Also save this as the customer's email"}
          </FieldLabel>
        </Field>
      ) : null}

      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button disabled={isPending} size="sm" type="submit">
          Send email
        </Button>
        <Button
          disabled={isPending}
          onClick={close}
          size="sm"
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
