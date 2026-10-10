import Image from "next/image";
import Link from "next/link";
import { ChevronRight, MapPin, Star } from "lucide-react";

import { StatusBadge } from "@/components/design-system/status-badge";
import { Button } from "@/components/ui/button";
import { customerPaymentLabel } from "@/features/booking/lib/customer-booking-labels";
import {
  canReviewBooking,
  isAwaitingPayment,
  type CustomerBooking,
} from "@/features/booking/types/customer-booking";
import { formatManila } from "@/features/shared/lib/manila-time";
import { formatPhp } from "@/features/vehicles/lib/rental-pricing";

function formatWhen(value: string) {
  if (!Number.isFinite(new Date(value).getTime())) return value;
  return formatManila(value, "stamp");
}

type AccountBookingCardProps = {
  booking: CustomerBooking;
};

export function AccountBookingCard({ booking }: AccountBookingCardProps) {
  const vehicleLabel =
    booking.vehicleName ||
    [booking.vehicleMake, booking.vehicleModel].filter(Boolean).join(" ") ||
    "Vehicle";
  const location = booking.pickupLocation || booking.returnLocation;
  const payHref = `/book/pay/${booking.id}?ref=${encodeURIComponent(booking.referenceNumber)}`;
  const awaiting = isAwaitingPayment(booking);
  const payment = customerPaymentLabel(booking.status, booking.paymentStatus);
  const detailHref = `/account/bookings/${booking.id}`;

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-col sm:flex-row">
        <div className="relative aspect-[16/10] w-full shrink-0 bg-brand-50 sm:aspect-auto sm:w-40 sm:self-stretch">
          {booking.vehiclePhotoUrl ? (
            <Image
              alt={vehicleLabel}
              className="object-cover"
              fill
              sizes="(max-width: 640px) 100vw, 160px"
              src={booking.vehiclePhotoUrl}
            />
          ) : (
            <div className="flex h-full min-h-28 items-center justify-center px-4 text-center text-xs font-medium text-brand-600">
              {vehicleLabel}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                className="block truncate text-base font-semibold text-brand-950 hover:underline"
                href={detailHref}
              >
                {vehicleLabel}
              </Link>
              <p className="mt-0.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {booking.referenceNumber}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <StatusBadge status={booking.status} />
              {payment ? (
                <span className="text-xs font-medium text-teal-700">
                  {payment}
                </span>
              ) : null}
            </div>
          </div>

          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Pick-up</dt>
              <dd className="font-medium text-brand-950">
                {formatWhen(booking.startAt)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Return</dt>
              <dd className="font-medium text-brand-950">
                {formatWhen(booking.expectedReturnAt)}
              </dd>
            </div>
            {booking.depositAmount != null ? (
              <div>
                <dt className="text-muted-foreground">Reservation fee</dt>
                <dd className="font-medium tabular-nums text-brand-950">
                  {formatPhp(booking.depositAmount)}
                </dd>
              </div>
            ) : null}
            {booking.quotedTotal != null ? (
              <div>
                <dt className="text-muted-foreground">Trip total</dt>
                <dd className="font-medium tabular-nums text-brand-950">
                  {formatPhp(booking.quotedTotal)}
                </dd>
              </div>
            ) : null}
          </dl>

          {location ? (
            <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <MapPin aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              <span>{location}</span>
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {canReviewBooking(booking) ? (
              <Button asChild className="w-full sm:w-auto" size="sm">
                <Link href={`${detailHref}#review`}>
                  <Star /> Rate your trip
                </Link>
              </Button>
            ) : null}
            {awaiting ? (
              <Button asChild className="w-full sm:w-auto" size="sm">
                <Link href={payHref}>
                  {booking.paymentStatus === "proof_submitted"
                    ? "View payment status"
                    : "Pay reservation fee"}
                </Link>
              </Button>
            ) : null}
            {booking.status === "active" ||
            booking.status === "completed" ||
            booking.status === "overdue" ? (
              <Button asChild className="w-full sm:w-auto" size="sm" variant="outline">
                <Link href={`/account/bookings/${booking.id}/condition`}>
                  Condition report
                </Link>
              </Button>
            ) : null}
            <Button asChild className="w-full sm:ml-auto sm:w-auto" size="sm" variant="ghost">
              <Link href={detailHref}>
                View details <ChevronRight />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
