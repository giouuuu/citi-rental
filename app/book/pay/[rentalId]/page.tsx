import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteHeader } from "@/components/landing/site-header";
import { BookingPaymentForm } from "@/features/booking/components/booking-payment-form";
import { getBookingPaymentDetails } from "@/features/booking/services/public-booking-service";
import { Button } from "@/components/ui/button";

type PayPageProps = {
  params: Promise<{ rentalId: string }>;
  searchParams: Promise<{ ref?: string }>;
};

export const metadata: Metadata = {
  title: "Pay deposit",
  description: "Pay your booking deposit and upload payment proof.",
};

export default async function BookingPayPage({
  params,
  searchParams,
}: PayPageProps) {
  const [{ rentalId }, query] = await Promise.all([params, searchParams]);
  const reference = query.ref?.trim();
  if (!reference) notFound();

  const booking = await getBookingPaymentDetails(rentalId, reference);
  if (!booking) notFound();

  return (
    <main className="min-h-screen bg-background" id="main-content">
      <div className="bg-brand-950 text-white">
        <SiteHeader />
      </div>

      <div className="mx-auto max-w-lg px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-brand-950">
          Pay deposit to confirm
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Your booking is held as a draft until we verify your {booking.depositPercent}%
          deposit. Upload the payment screenshot and reference number below.
        </p>

        <div className="mt-8">
          <BookingPaymentForm booking={booking} />
        </div>

        <div className="mt-8 flex justify-center">
          <Button asChild variant="ghost">
            <Link href="/#fleet">Back to fleet</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
