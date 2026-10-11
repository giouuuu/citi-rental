import Image from "next/image";
import Link from "next/link";
import {
  CalendarDays,
  CarFront,
  ClipboardCheck,
  Heart,
  MapPin,
  Navigation,
  ReceiptText,
  Star,
  UserRound,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { siFacebook, siGoogle, type SimpleIcon } from "simple-icons";

import { StatusBadge } from "@/components/design-system/status-badge";
import { RENTAL_STATUS_LABELS } from "@/features/rentals/lib/rental-status-counts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { BookingReviewForm } from "@/features/booking/components/booking-review-form";
import { CancelBookingButton } from "@/features/booking/components/cancel-booking-button";
import { EditBookingDetailsDialog } from "@/features/booking/components/edit-booking-details-dialog";
import type { PublicBookingFees } from "@/features/booking/services/public-booking-service";
import {
  customerCancellationLabel,
  customerPaymentLabel,
  customerPaymentStatus,
  customerPaymentTitle,
  paymentMethodLabel,
} from "@/features/booking/lib/customer-booking-labels";
import { customerPaymentKind } from "@/features/booking/lib/booking-payment-step";
import type { CustomerBookingDetail } from "@/features/booking/types/customer-booking-detail";
import {
  describeRentLine,
  rentalBillStatus,
  withBookingFeesInRent,
} from "@/features/rentals/lib/rental-bill";
import {
  type DriverTerms,
  driverDayNote,
  driverExtraHoursLine,
  driverLineLabel,
} from "@/features/booking/lib/driver-terms";
import { formatDuration } from "@/features/shared/lib/format-duration";
import { formatManila } from "@/features/shared/lib/manila-time";
import { formatPhpExact } from "@/features/shared/lib/money";
import type { ReviewLinks } from "@/features/settings/lib/review-links";
import { vehicleModelLine } from "@/features/vehicles/lib/vehicle-model-line";
import { cn } from "@/lib/utils";

function Detail({
  icon: Icon,
  label,
  children,
  className,
}: {
  icon?: typeof MapPin;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-3", className)}>
      {Icon ? (
        <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      ) : null}
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 text-sm font-medium break-words text-brand-950">{children}</dd>
      </div>
    </div>
  );
}

function BillLine({
  label,
  detail,
  amount,
  strong,
  tone,
}: {
  label: string;
  detail?: string | null;
  /** A string is shown as is and is not money in the total ("₱250 / hour"). */
  amount: number | string;
  strong?: boolean;
  tone?: "credit";
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className={cn("text-sm", strong ? "font-semibold text-brand-950" : "text-foreground")}>
          {label}
        </p>
        {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
      </div>
      <p
        className={cn(
          "shrink-0 text-sm tabular-nums",
          strong && "font-semibold text-brand-950",
          tone === "credit" && "text-success",
        )}
      >
        {tone === "credit" ? "− " : ""}
        {typeof amount === "string" ? amount : formatPhpExact(amount)}
      </p>
    </div>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span aria-label={`${rating} out of 5 stars`} className="inline-flex" role="img">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          aria-hidden="true"
          className={cn(
            "size-4",
            star <= rating ? "fill-gold-500 text-gold-500" : "fill-transparent text-border",
          )}
          key={star}
        />
      ))}
    </span>
  );
}

function BrandGlyph({ icon }: { icon: SimpleIcon }) {
  return (
    <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
      <path d={icon.path} />
    </svg>
  );
}

/** Completed trips: the owner's thank-you note and the outside review links. */
function ThankYouCard({ links }: { links: ReviewLinks }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Heart aria-hidden="true" className="size-4 text-gold-500" /> Thank you
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm whitespace-pre-line text-foreground">{links.thankYou}</p>
        {links.google || links.facebook ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            {links.google ? (
              <Button asChild variant="outline">
                <a href={links.google} rel="noopener noreferrer" target="_blank">
                  <BrandGlyph icon={siGoogle} /> Review us on Google
                </a>
              </Button>
            ) : null}
            {links.facebook ? (
              <Button asChild variant="outline">
                <a href={links.facebook} rel="noopener noreferrer" target="_blank">
                  <BrandGlyph icon={siFacebook} /> Review us on Facebook
                </a>
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Everything one booking holds for the renter: the car, the trip, the bill
 * line by line, every payment and its status, and their review. Once the
 * rental is completed the bill gives way to a thank-you and review links.
 */
export function AccountBookingDetail({
  booking,
  bookingFees = null,
  driverTerms = null,
  reviewLinks = null,
}: {
  booking: CustomerBookingDetail;
  /** Settings → the hours a driver day covers and overtime, for the driver line. */
  driverTerms?: DriverTerms | null;
  /** Delivery fees and office address, for editing pick-up and return. */
  bookingFees?: PublicBookingFees | null;
  /** Completed rentals only. */
  reviewLinks?: ReviewLinks | null;
}) {
  const { vehicle } = booking;
  // Fees on every booking (the car wash) read as part of the rent.
  const bill = withBookingFeesInRent(booking.bill);
  const modelLine = vehicleModelLine(vehicle);
  // Once a car is booked, the bill (charges included) says where payment
  // stands; payment_status alone misses charges added after paying in full.
  const payment =
    booking.status === "draft" || booking.status === "cancelled"
      ? customerPaymentLabel(booking.status, booking.paymentStatus)
      : rentalBillStatus(bill, booking.paymentStatus);
  const paymentKind = customerPaymentKind({
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    depositAmount: booking.depositAmount ?? null,
    billTotal: bill.total,
    amountPaid: bill.paid,
  });
  const awaiting = paymentKind === "reservation_fee";
  const proofBeingChecked = bill.received.some((entry) => entry.status === "submitted");
  const cancellable = booking.status === "draft" || booking.status === "reserved";
  const hasConditionReport =
    booking.status === "active" || booking.status === "completed" || booking.status === "overdue";
  const returnedAt = booking.actualReturnAt;
  const duration = formatDuration(
    new Date(booking.startAt),
    new Date(returnedAt ?? booking.expectedReturnAt),
  );
  const rentLine = describeRentLine(bill.rent);
  const extraHours =
    bill.driver?.rate != null ? driverExtraHoursLine(driverTerms) : null;
  const payHref = `/book/pay/${booking.id}?ref=${encodeURIComponent(booking.referenceNumber)}`;
  const cancelled = booking.status === "cancelled";
  const completed = booking.status === "completed";

  return (
    <div className="space-y-6">
      {/* The car and where the booking stands */}
      <Card className="overflow-hidden py-0">
        <div className="flex flex-col sm:flex-row">
          <div className="relative aspect-[16/10] w-full shrink-0 bg-brand-50 sm:aspect-auto sm:w-56 sm:self-stretch">
            {vehicle.photoUrl ? (
              <Image
                alt={vehicle.name}
                className="object-cover"
                fill
                priority
                sizes="(max-width: 640px) 100vw, 224px"
                src={vehicle.photoUrl}
              />
            ) : (
              <div className="flex h-full min-h-36 items-center justify-center text-brand-300">
                <CarFront aria-hidden="true" className="size-12" />
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-brand-950">{vehicle.name}</h2>
                {modelLine ? (
                  <p className="text-sm text-muted-foreground tabular-nums">{modelLine}</p>
                ) : null}
                <p className="mt-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {booking.referenceNumber}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <StatusBadge label={RENTAL_STATUS_LABELS[booking.status]} status={booking.status} />
                {payment ? <span className="text-xs font-medium text-teal-700">{payment}</span> : null}
              </div>
            </div>

            <dl className="grid gap-3 sm:grid-cols-2">
              {vehicle.plateNumber && !cancelled ? (
                <Detail label="Plate number">
                  <span className="font-mono">{vehicle.plateNumber}</span>
                </Detail>
              ) : null}
              <Detail label="Driving">{booking.withDriver ? "With driver" : "Self-drive"}</Detail>
            </dl>

            {paymentKind || booking.detailsEditable || cancellable || hasConditionReport ? (
              <div className="flex flex-wrap gap-2">
                {paymentKind ? (
                  <Button asChild size="sm">
                    <Link href={payHref}>
                      {proofBeingChecked
                        ? "View payment status"
                        : awaiting
                          ? "Pay reservation fee"
                          : "Pay balance"}
                    </Link>
                  </Button>
                ) : null}
                {booking.detailsEditable ? (
                  <EditBookingDetailsDialog
                    booking={booking}
                    deliveryFees={bookingFees?.delivery}
                    officeAddress={bookingFees?.officeAddress}
                  />
                ) : null}
                {hasConditionReport ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/account/bookings/${booking.id}/condition`}>
                      <ClipboardCheck /> Condition report
                    </Link>
                  </Button>
                ) : null}
                {cancellable ? (
                  <CancelBookingButton
                    depositAmount={booking.depositAmount ?? 0}
                    freeCancellationHours={booking.freeCancellationHours}
                    paymentStatus={booking.paymentStatus}
                    rentalId={booking.id}
                    startAt={booking.startAt}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      {cancelled ? (
        <div className="rounded-xl border bg-muted/40 p-4 text-sm">
          <p className="font-medium text-brand-950">
            {customerCancellationLabel(booking.cancellationReason)}
          </p>
          <p className="mt-1 text-muted-foreground">
            {booking.cancelledAt ? `Cancelled ${formatManila(booking.cancelledAt, "stamp")}. ` : ""}
            {booking.reservationFeeForfeited === true
              ? "It was inside the free-cancellation window, so the reservation fee is kept."
              : booking.reservationFeeForfeited === false
                ? "Your reservation fee is refundable. We'll send it back to you."
                : null}
          </p>
        </div>
      ) : null}

      {/* The trip */}
      <Card>
        <CardHeader>
          <CardTitle>Trip</CardTitle>
          {duration ? <CardDescription>{duration}</CardDescription> : null}
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail icon={CalendarDays} label="Pick-up">
              {formatManila(booking.startAt, "stamp")}
            </Detail>
            <Detail icon={CalendarDays} label={returnedAt ? "Returned" : "Return"}>
              {formatManila(returnedAt ?? booking.expectedReturnAt, "stamp")}
              {returnedAt ? (
                <span className="block text-xs font-normal text-muted-foreground">
                  Booked until {formatManila(booking.expectedReturnAt, "stamp")}
                </span>
              ) : null}
            </Detail>
            {booking.pickupLocation ? (
              <Detail
                icon={MapPin}
                label={
                  booking.pickupMethod === "office"
                    ? "Pick-up at our office"
                    : booking.pickupMethod
                      ? "Delivery address"
                      : "Pick-up or delivery"
                }
              >
                {booking.pickupLocation}
              </Detail>
            ) : null}
            {booking.returnLocation ? (
              <Detail
                icon={MapPin}
                label={
                  booking.returnMethod === "office"
                    ? "Return at our office"
                    : booking.returnMethod
                      ? "Collection address"
                      : "Return location"
                }
              >
                {booking.returnLocation}
              </Detail>
            ) : null}
            {booking.destination ? (
              <Detail icon={Navigation} label="Destination">
                {booking.destination}
              </Detail>
            ) : null}
            {booking.passengerCount ? (
              <Detail icon={Users} label="Passengers">
                {booking.passengerCount}
              </Detail>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      {/* The bill, until the rental is completed; then a thank-you */}
      {completed ? (
        reviewLinks ? (
          <ThankYouCard links={reviewLinks} />
        ) : null
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Bill</CardTitle>
            <CardDescription>{rentalBillStatus(bill, booking.paymentStatus)}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              <BillLine amount={bill.rent.total} detail={rentLine} label="Car rental" />
              {bill.driver ? (
                <BillLine
                  amount={bill.driver.fee}
                  detail={
                    bill.driver.rate != null
                      ? driverDayNote(bill.driver.rate, driverTerms)
                      : "Quoted by our staff"
                  }
                  label={driverLineLabel(bill.driver.days)}
                />
              ) : null}
              {extraHours ? (
                <BillLine
                  amount={extraHours.amount}
                  detail={extraHours.detail}
                  label={extraHours.label}
                />
              ) : null}
              {bill.handover.map((line) => (
                <BillLine
                  amount={line.fee}
                  detail={line.detail}
                  key={line.label}
                  label={line.label}
                />
              ))}
              {bill.bookingFees.map((fee) => (
                <BillLine amount={fee.amount} key={fee.name} label={fee.name} />
              ))}
              {bill.charges.map((charge) => (
                <BillLine
                  amount={charge.amount}
                  detail={formatManila(charge.submittedAt, "date")}
                  key={charge.id}
                  label={customerPaymentTitle(charge)}
                />
              ))}
              <BillLine amount={bill.total} label="Total" strong />
              {bill.paid > 0 ? <BillLine amount={bill.paid} label="You paid" tone="credit" /> : null}
              {!cancelled ? (
                <BillLine
                  amount={bill.balance}
                  detail={
                    bill.balance > 0
                      ? paymentKind === "open_bill"
                        ? "Pay it online with Pay balance, or in person."
                        : "Settle the rest at pickup, or as agreed with us."
                      : null
                  }
                  label="Balance"
                  strong
                />
              ) : null}
            </div>
            {booking.depositAmount && booking.status === "draft" ? (
              <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                A {formatPhpExact(booking.depositAmount)} reservation fee holds these dates. It counts
                toward your total.
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Payments */}
      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
          <CardDescription>Everything you sent us, and anything we sent back.</CardDescription>
        </CardHeader>
        <CardContent>
          {bill.received.length ? (
            <ul className="divide-y">
              {bill.received.map((entry) => {
                const state = customerPaymentStatus(entry);
                const method = paymentMethodLabel(entry.method);
                return (
                  <li className="flex flex-wrap items-start justify-between gap-3 py-3" key={entry.id}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-brand-950">{customerPaymentTitle(entry)}</p>
                      <p className="text-xs text-muted-foreground">
                        {[
                          formatManila(entry.confirmedAt ?? entry.submittedAt, "stamp"),
                          method,
                          entry.externalReference ? `Ref ${entry.externalReference}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge className="normal-case" label={state.label} status={state.tone} />
                      <span className="text-sm font-semibold tabular-nums text-brand-950">
                        {entry.paymentType === "refund" ? "− " : ""}
                        {formatPhpExact(entry.amount)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty className="border border-dashed p-6">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ReceiptText />
                </EmptyMedia>
                <EmptyTitle>No payments yet</EmptyTitle>
                <EmptyDescription>
                  {awaiting
                    ? "Pay the reservation fee to hold your dates."
                    : "Payments you make show here once we record them."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      {/* Review */}
      {completed ? (
        <Card id="review">
          <CardHeader>
            <CardTitle>Your review</CardTitle>
            <CardDescription>
              {booking.review
                ? booking.review.isPublished
                  ? "Thank you! It's on our homepage."
                  : "Thank you! We'll post it on our homepage after a quick look."
                : "Tell other renters how it went. It takes a minute."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {booking.review ? (
              <figure className="rounded-lg bg-muted/40 p-4">
                {booking.review.rating ? <Stars rating={booking.review.rating} /> : null}
                {booking.review.body ? (
                  <blockquote className="mt-2 text-sm whitespace-pre-line text-foreground">
                    {booking.review.body}
                  </blockquote>
                ) : null}
                <figcaption className="mt-2 text-xs text-muted-foreground">
                  {booking.review.reviewerName} · {formatManila(booking.review.createdAt, "date")}
                </figcaption>
              </figure>
            ) : (
              <BookingReviewForm rentalId={booking.id} vehicleName={vehicle.name} />
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Booking record */}
      <Card>
        <CardHeader>
          <CardTitle>Booking details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail label="Reference">
              <span className="font-mono">{booking.referenceNumber}</span>
            </Detail>
            <Detail label="Booked">
              {formatManila(booking.createdAt, "stamp")}
              {booking.bookedOnline ? " · online" : ""}
            </Detail>
            {booking.customer.fullName ? (
              <Detail icon={UserRound} label="Renter">
                {booking.customer.fullName}
                {[booking.customer.phoneNumber, booking.customer.email].filter(Boolean).length ? (
                  <span className="block text-xs font-normal text-muted-foreground">
                    {[booking.customer.phoneNumber, booking.customer.email].filter(Boolean).join(" · ")}
                  </span>
                ) : null}
              </Detail>
            ) : null}
            {booking.termsAcceptedAt ? (
              <Detail label="Booking terms">
                Accepted {formatManila(booking.termsAcceptedAt, "stamp")}
                {booking.termsVersion ? (
                  <span className="block text-xs font-normal text-muted-foreground">
                    Version {booking.termsVersion}
                  </span>
                ) : null}
              </Detail>
            ) : null}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
