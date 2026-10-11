import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { SiteHeader } from "@/components/landing/site-header";
import { bookingPaymentStep } from "@/features/booking/lib/booking-payment-step";
import { BookingPaymentForm } from "@/features/booking/components/booking-payment-form";
import { CancelBookingButton } from "@/features/booking/components/cancel-booking-button";
import { EditBookingDetailsDialog } from "@/features/booking/components/edit-booking-details-dialog";
import {
  DEFAULT_FREE_CANCELLATION_HOURS,
  hoursPhrase,
} from "@/features/booking/lib/cancellation-policy";
import { isBookingUserSignedIn } from "@/features/booking/lib/is-booking-user-signed-in";
import {
  PaymongoCheckoutButton,
  type PaymongoReturn,
} from "@/features/booking/components/paymongo-checkout-button";
import { isPaymongoEnabled } from "@/features/booking/lib/paymongo";
import { getMyBooking } from "@/features/booking/services/get-my-booking";
import {
  getBookingPaymentDetails,
  getPublicBookingFees,
  getPublicFreeCancellationHours,
} from "@/features/booking/services/public-booking-service";
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

  // The booking belongs to its signed-in owner, not to whoever holds the link.
  if (!(await isBookingUserSignedIn())) {
    const next = `/book/pay/${rentalId}?ref=${encodeURIComponent(reference)}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const [booking, freeCancellationHours, myBooking, bookingFees] =
    await Promise.all([
      getBookingPaymentDetails(rentalId, reference),
      getPublicFreeCancellationHours(),
      // Its details, for editing what was typed until the fee is paid.
      getMyBooking(rentalId),
      // Prices a pick-up or return change in that edit.
      getPublicBookingFees(),
    ]);
  if (!booking) notFound();

  if (booking.status === "cancelled") {
    return (
      <main className="min-h-screen bg-background" id="main-content">
        <div className="bg-brand-950 text-white">
          <SiteHeader />
        </div>
        <div className="mx-auto max-w-lg px-4 py-12 sm:px-6">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {booking.referenceNumber}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-brand-950">
            Booking cancelled
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Your {booking.vehicleName} booking is cancelled.{" "}
            {booking.reservationFeeForfeited === true
              ? `The ${formatPhp(booking.depositAmount)} reservation fee is not refunded, as the cancellation policy states.`
              : booking.reservationFeeForfeited === false
                ? `Your ${formatPhp(booking.depositAmount)} reservation fee will be refunded. We will message you to arrange it.`
                : "Nothing was paid, so there is nothing to refund."}
          </p>
          <div className="mt-8 flex flex-col gap-2 sm:flex-row">
            <Button asChild>
              <Link href="/#fleet">Find another car</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/account">My bookings</Link>
            </Button>
          </div>
        </div>
      </main>
    );
  }

  const cancellable =
    booking.status === "draft" || booking.status === "reserved";
  const step = bookingPaymentStep(booking);
  const heading =
    step.kind === "open_bill" || step.kind === "open_bill_sent"
      ? {
          title: "Pay your balance",
          description:
            "Pay what is left on your bill, all at once or in parts. We check each payment, then it shows on your bill.",
        }
      : step.kind === "nothing_due"
        ? {
            title: "Your payment",
            description: "Nothing is due on this booking right now.",
          }
        : booking.status === "reserved"
          ? {
              title: "Pay your reservation fee",
              description: `Your car is reserved. Send the ${formatPhp(booking.depositAmount)} reservation fee; it counts toward your total.`,
            }
          : {
              title: "Pay reservation fee to confirm",
              description: `Send the ${formatPhp(booking.depositAmount)} reservation fee to hold these dates. The car is held for you as soon as your payment is in; we then confirm your booking.`,
            };
  const hours = freeCancellationHours ?? DEFAULT_FREE_CANCELLATION_HOURS;

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
          {heading.title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {heading.description}
        </p>

        <div className="mt-8">
          <BookingPaymentForm
            booking={booking}
            onlinePayment={
              // PayMongo takes the reservation fee on a draft only.
              isPaymongoEnabled() && booking.status === "draft" ? (
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

        {myBooking?.detailsEditable ? (
          <section
            aria-labelledby="edit-booking-title"
            className="mt-8 rounded-xl border border-border bg-card p-5"
          >
            <h2
              className="text-base font-semibold text-brand-950"
              id="edit-booking-title"
            >
              Typed something wrong?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              You can edit your details, trip, and pick-up or delivery until
              you pay the reservation fee.
            </p>
            <div className="mt-4">
              <EditBookingDetailsDialog
                booking={myBooking}
                deliveryFees={bookingFees.delivery}
                officeAddress={bookingFees.officeAddress}
              />
            </div>
          </section>
        ) : null}

        {cancellable ? (
          <section
            aria-labelledby="cancel-booking-title"
            className="mt-8 rounded-xl border border-border bg-card p-5"
          >
            <h2
              className="text-base font-semibold text-brand-950"
              id="cancel-booking-title"
            >
              Change of plans?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {hours > 0
                ? `Cancel up to ${hoursPhrase(hours)} before pick-up and a paid reservation fee is refunded. Cancel later and it is not.`
                : "A paid reservation fee is not refunded if you cancel."}
            </p>
            <div className="mt-4">
              <CancelBookingButton
                depositAmount={booking.depositAmount}
                freeCancellationHours={freeCancellationHours}
                paymentStatus={booking.paymentStatus}
                rentalId={booking.rentalId}
                startAt={booking.startAt}
              />
            </div>
          </section>
        ) : null}

        <div className="mt-8 flex justify-center">
          <Button asChild variant="ghost">
            <Link href="/#fleet">Back to fleet</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
