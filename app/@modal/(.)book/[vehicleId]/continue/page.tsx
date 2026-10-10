import { redirect } from "next/navigation";

import { bookingFormPath } from "@/features/booking/lib/booking-continue";

type InterceptedContinuePageProps = {
  params: Promise<{ vehicleId: string }>;
  searchParams: Promise<{
    pickup?: string;
    start?: string;
    end?: string;
    mode?: string;
  }>;
};

/** Same as the full page: no sign-in step before the form any more. */
export default async function InterceptedBookContinuePage({
  params,
  searchParams,
}: InterceptedContinuePageProps) {
  const { vehicleId } = await params;
  const { pickup, start, end, mode } = await searchParams;
  redirect(bookingFormPath(vehicleId, { pickup, start, end, mode }));
}
