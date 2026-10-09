import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteHeader } from "@/components/landing/site-header";
import { BookingPaymentForm } from "@/features/booking/components/booking-payment-form";
import {
  PaymongoCheckoutButton,
  type PaymongoReturn,
} from "@/features/booking/components/paymongo-checkout-button";
import { isPaymongoEnabled } from "@/features/booking/lib/paymongo";
import { getBookingPaymentDetails } from "@/features/booking/services/public-booking-service";
import { formatPhp } from "@/features/vehicles/lib/rental-pricing";
import { Button } from "@/components/ui/button";
import { NOINDEX } from "@/features/seo/lib/business";

type PayPageProps = {
  params: Promise<{ rentalId: string }>;
  searchParams: Promise<{ ref?: string; paymongo?: string }>;
};

export const metadata: Metadata = {
  title: "Pay reservation fee",
  description: "Pay your reservation fee and upload payment proof.",
  robots: NOINDEX,
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

  const paymongoReturn: PaymongoReturn =
    query.paymongo === "success" || query.paymongo === "cancelled"
      ? query.paymongo
      : null;

  return (
    <main className="min-h-screen bg-background" id="main-content">
      <div className="bg-brand-950 text-white">
        <SiteHeader />
      </div>

      <div className="mx-auto max-w-lg px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-brand-950">
          Pay reservation fee to confirm
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Your booking is held as a draft until we verify your{" "}
          {formatPhp(booking.depositAmount)} reservation fee. Upload the payment
          screenshot and reference number below.
        </p>

        <div className="mt-8">
          <BookingPaymentForm
            booking={booking}
            onlinePayment={
              isPaymongoEnabled() ? (
                <PaymongoCheckoutButton
                  amount={booking.depositAmount}
                  referenceNumber={booking.referenceNumber}
                  rentalId={booking.rentalId}
                  returned={paymongoReturn}
                />
              ) : null
            }
          />
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
