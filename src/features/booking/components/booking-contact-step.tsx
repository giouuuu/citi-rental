"use client";

import Link from "next/link";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { Info, ShieldCheck } from "lucide-react";
import { type FormEvent, useRef, useState, useTransition } from "react";

import { lookupBookingContactAction } from "@/features/booking/actions/lookup-booking-contact-action";
import {
  bookingContactHint,
  parseBookingContact,
  TURNSTILE_LOOKUP_ACTION,
  type ResolvedBookingContact,
} from "@/features/booking/lib/booking-contact";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

type BookingContactStepProps = {
  initialValue?: string;
  signInHref: string;
  turnstileSiteKey: string | null;
  onResolved: (contact: ResolvedBookingContact, rawValue: string) => void;
};

/**
 * Guest step 1: "email or mobile number". Like a GitHub invite box, nothing
 * is searched until the identifier is complete, and the lookup is an exact
 * match only. Each lookup spends one Turnstile token.
 */
export function BookingContactStep({
  initialValue = "",
  signInHref,
  turnstileSiteKey,
  onResolved,
}: BookingContactStepProps) {
  const turnstileRef = useRef<TurnstileInstance>(null);
  const [value, setValue] = useState(initialValue);
  const [token, setToken] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const contact = parseBookingContact(value);
  const hint = bookingContactHint(value);
  const canSubmit = Boolean(contact && token && !pending);

  function resetChallenge() {
    setToken(null);
    turnstileRef.current?.reset();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contact || !token || pending) return;

    setFieldError(undefined);
    setFormError(undefined);
    const formData = new FormData();
    formData.set("contact", value);
    formData.set("turnstileToken", token);

    startTransition(async () => {
      const result = await lookupBookingContactAction(formData);
      // Tokens are single-use: get a fresh one whatever the outcome.
      resetChallenge();
      if (result.success && result.data) {
        onResolved(result.data, value);
        return;
      }
      if (!result.success) {
        const contactError = result.fieldErrors?.contact?.[0];
        if (contactError) setFieldError(contactError);
        else setFormError(result.message);
      }
    });
  }

  if (!turnstileSiteKey) {
    return (
      <div className="space-y-4">
        <Alert>
          <Info />
          <AlertDescription>
            Guest booking is temporarily unavailable. Sign in to reserve this
            car.
          </AlertDescription>
        </Alert>
        <Button asChild size="lg">
          <Link href={signInHref}>Sign in to continue</Link>
        </Button>
      </div>
    );
  }

  return (
    <form className="space-y-5" noValidate onSubmit={onSubmit}>
      <div>
        <h2 className="text-lg font-bold text-brand-950">
          Start with your email or mobile number
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Booked with us before? We will recognise you and skip the paperwork.
        </p>
      </div>

      <Field data-invalid={Boolean(fieldError)}>
        <FieldLabel htmlFor="booking-contact">
          Email or mobile number
        </FieldLabel>
        <Input
          aria-describedby="booking-contact-hint"
          aria-invalid={Boolean(fieldError)}
          autoComplete="email"
          autoFocus
          className="h-11"
          disabled={pending}
          id="booking-contact"
          inputMode="email"
          name="contact"
          onChange={(event) => {
            setValue(event.target.value);
            setFieldError(undefined);
          }}
          placeholder="you@email.com or 0917 123 4567"
          spellCheck={false}
          value={value}
        />
        <FieldDescription id="booking-contact-hint">
          {hint ?? "Type it in full. We only look up an exact match."}
        </FieldDescription>
        {fieldError ? <FieldError>{fieldError}</FieldError> : null}
      </Field>

      <Turnstile
        className="min-h-0"
        onError={() => {
          setToken(null);
          setFormError(
            "The human check could not load. Refresh the page and try again.",
          );
        }}
        onExpire={() => setToken(null)}
        onSuccess={(next) => {
          setToken(next);
          setFormError(undefined);
        }}
        options={{
          action: TURNSTILE_LOOKUP_ACTION,
          appearance: "interaction-only",
          size: "flexible",
          theme: "auto",
        }}
        ref={turnstileRef}
        siteKey={turnstileSiteKey}
      />

      {formError ? (
        <Alert variant="destructive">
          <Info />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Have an account?{" "}
          <Link
            className="font-medium text-teal-700 underline"
            href={signInHref}
          >
            Sign in instead
          </Link>
        </p>
        <Button
          className="min-w-44"
          disabled={!canSubmit}
          size="lg"
          type="submit"
        >
          {pending ? <Spinner /> : contact && !token ? <ShieldCheck /> : null}
          {pending
            ? "Checking..."
            : contact && !token
              ? "Verifying..."
              : "Continue"}
        </Button>
      </div>
    </form>
  );
}
