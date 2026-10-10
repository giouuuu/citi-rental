"use client";

import type { ComponentProps } from "react";

import { BookingForm } from "@/features/booking/components/booking-form";
import { BookingSignInStep } from "@/features/booking/components/booking-sign-in-step";
import type { BookingContinueQuery } from "@/features/booking/lib/booking-continue";

type BookingFlowProps = ComponentProps<typeof BookingForm> & {
  signedIn: boolean;
  /** The trip from the URL, carried through sign-in. */
  query: BookingContinueQuery;
};

/**
 * Only signed-in customers book. Everyone else signs in first and comes
 * back to this form.
 */
export function BookingFlow({
  signedIn,
  query,
  ...formProps
}: BookingFlowProps) {
  if (signedIn) return <BookingForm {...formProps} />;

  return (
    <section className="rounded-xl border border-border bg-background p-4 sm:p-6">
      <h2 className="text-lg font-bold text-brand-950">Sign in to book</h2>
      <div className="mt-3">
        <BookingSignInStep
          query={query}
          vehicleId={formProps.vehicle.id}
          vehicleName={formProps.vehicle.name}
        />
      </div>
    </section>
  );
}
