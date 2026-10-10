import { redirect } from "next/navigation";

import { bookingFormPath } from "@/features/booking/lib/booking-continue";

type ContinuePageProps = {
  params: Promise<{ vehicleId: string }>;
  searchParams: Promise<{
    pickup?: string;
    start?: string;
    end?: string;
    mode?: string;
  }>;
};

/**
 * Booking used to ask for sign-in here first. Guests now fill in the form
 * and sign in when they confirm, so old links go straight to it.
 */
export default async function BookContinuePage({
  params,
  searchParams,
}: ContinuePageProps) {
  const { vehicleId } = await params;
  const { pickup, start, end, mode } = await searchParams;
  redirect(bookingFormPath(vehicleId, { pickup, start, end, mode }));
}
