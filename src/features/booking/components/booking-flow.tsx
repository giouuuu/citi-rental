"use client";

import { type ComponentProps, useState } from "react";

import { BookingContactStep } from "@/features/booking/components/booking-contact-step";
import { BookingForm } from "@/features/booking/components/booking-form";
import type { ResolvedBookingContact } from "@/features/booking/lib/booking-contact";

type BookingFlowProps = Omit<
  ComponentProps<typeof BookingForm>,
  "contact" | "onChangeContact"
> & {
  signedIn: boolean;
  signInHref: string;
  turnstileSiteKey: string | null;
};

/**
 * Signed-in customers go straight to the booking form. Guests first enter an
 * email or mobile number; a returning customer then books with trip details
 * only, a new one fills in the full form.
 */
export function BookingFlow({
  signedIn,
  signInHref,
  turnstileSiteKey,
  ...formProps
}: BookingFlowProps) {
  const [contact, setContact] = useState<ResolvedBookingContact>();
  const [rawContact, setRawContact] = useState("");

  if (signedIn) return <BookingForm {...formProps} />;

  if (!contact) {
    return (
      <BookingContactStep
        initialValue={rawContact}
        onResolved={(resolved, raw) => {
          setRawContact(raw);
          setContact(resolved);
        }}
        signInHref={signInHref}
        turnstileSiteKey={turnstileSiteKey}
      />
    );
  }

  return (
    <BookingForm
      {...formProps}
      contact={contact}
      // Remount so default values follow the newly resolved contact.
      key={`${contact.kind}:${contact.value}`}
      onChangeContact={() => setContact(undefined)}
    />
  );
}
