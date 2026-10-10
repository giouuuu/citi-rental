import Image from "next/image";
import Link from "next/link";
import {
  CalendarDays,
  CarFront,
  ClipboardCheck,
  MapPin,
  Navigation,
  ReceiptText,
  Star,
  UserRound,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";

import { StatusBadge } from "@/components/design-system/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { BookingReviewForm } from "@/features/booking/components/booking-review-form";
import { CancelBookingButton } from "@/features/booking/components/cancel-booking-button";
import {
  customerCancellationLabel,
  customerPaymentLabel,
  customerPaymentStatus,
  customerPaymentTitle,
  paymentMethodLabel,
} from "@/features/booking/lib/customer-booking-labels";
import type { CustomerBookingDetail } from "@/features/booking/types/customer-booking-detail";
import { describeRentLine, rentalBillStatus } from "@/features/rentals/lib/rental-bill";
import { formatDuration } from "@/features/shared/lib/format-duration";
import { formatManila } from "@/features/shared/lib/manila-time";
import { formatPhpExact } from "@/features/shared/lib/money";
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
  amount: number;
  strong?: boolean;
  tone?: "credit" | "due";
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
          tone === "due" && "font-semibold text-destructive",
        )}
      >
        {tone === "credit" ? "− " : ""}
        {formatPhpExact(amount)}
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

/**
 * Everything one booking holds for the renter: the car, the trip, the bill
 * line by line, every payment and its status, and their review.
 */
export function AccountBookingDetail({ booking }: { booking: CustomerBookingDetail }) {
  const { bill, vehicle } = booking;
  const modelLine = vehicleModelLine(vehicle);
  // Once a car is booked, the bill (charges included) says where payment
  // stands; payment_status alone misses charges added after paying in full.
  const payment =
    booking.status === "draft" || booking.status === "cancelled"
      ? customerPaymentLabel(booking.status, booking.paymentStatus)
      : rentalBillStatus(bill, booking.paymentStatus);
  const awaiting =
    booking.status === "draft" &&
    (booking.paymentStatus === "unpaid" || booking.paymentStatus === "proof_submitted");
  const cancellable = booking.status === "draft" || booking.status === "reserved";
  const hasConditionReport =
    booking.status === "active" || booking.status === "completed" || booking.status === "overdue";
  const returnedAt = booking.actualReturnAt;
  const duration = formatDuration(
    new Date(booking.startAt),
    new Date(returnedAt ?? booking.expectedReturnAt),
  );
  const rentLine = describeRentLine(bill.rent);
  const payHref = `/book/pay/${booking.id}?ref=${encodeURIComponent(booking.referenceNumber)}`;
  const cancelled = booking.status === "cancelled";

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
                <StatusBadge status={booking.status} />
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

            {awaiting || cancellable || hasConditionReport ? (
              <div className="flex flex-wrap gap-2">
                {awaiting ? (
                  <Button asChild size="sm">
                    <Link href={payHref}>
                      {booking.paymentStatus === "proof_submitted"
                        ? "View payment status"
                        : "Pay reservation fee"}
                    </Link>
                  </Button>
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
              <Detail icon={MapPin} label="Pick-up or delivery">
                {booking.pickupLocation}
              </Detail>
            ) : null}
            {booking.returnLocation ? (
              <Detail icon={MapPin} label="Return location">
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

      {/* The bill */}
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
                  bill.driver.rate != null && bill.driver.days != null
                    ? `${formatPhpExact(bill.driver.rate)} × ${bill.driver.days} ${bill.driver.days === 1 ? "day" : "days"}`
                    : "Quoted by our staff"
                }
                label="Driver"
              />
            ) : null}
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
                  bill.balance > 0 && booking.status !== "completed"
                    ? "Settle the rest at pickup, or as agreed with us."
                    : null
                }
                label="Balance"
                strong
                tone={bill.balance > 0 && booking.status === "completed" ? "due" : undefined}
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
      {booking.status === "completed" ? (
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
