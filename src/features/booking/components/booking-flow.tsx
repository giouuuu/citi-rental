"use client";

import type { ComponentProps } from "react";

import { BookingForm } from "@/features/booking/components/booking-form";

/**
 * Anyone can fill in the booking; sign-in is asked for only when a guest
 * presses Confirm. The key remounts the form once they come back signed in,
 * so it picks up their saved draft.
 */
export function BookingFlow(props: ComponentProps<typeof BookingForm>) {
  return <BookingForm key={props.signedIn ? "member" : "guest"} {...props} />;
}
