"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { CircleAlert, Info, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { cancelMyBookingAction } from "@/features/booking/actions/cancel-my-booking-action";
import {
  cancellationOutcome,
  DEFAULT_FREE_CANCELLATION_HOURS,
  hoursPhrase,
  type CancellationOutcome,
} from "@/features/booking/lib/cancellation-policy";
import type { RentalPaymentStatus } from "@/features/booking/types/booking-payment";
import { formatPhp } from "@/features/vehicles/lib/rental-pricing";

/**
 * Cancel from the pay page. The dialog says up front what happens to the
 * reservation fee; inside the no-refund window the renter must tick that
 * they understand it is kept before the button works.
 */
export function CancelBookingButton({
  rentalId,
  paymentStatus,
  startAt,
  depositAmount,
  freeCancellationHours,
}: {
  rentalId: string;
  paymentStatus: RentalPaymentStatus;
  startAt: string;
  depositAmount: number;
  freeCancellationHours: number | null;
}) {
  const router = useRouter();
  const acknowledgeId = useId();
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<CancellationOutcome>("nothing-paid");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const hours = freeCancellationHours ?? DEFAULT_FREE_CANCELLATION_HOURS;
  const fee = formatPhp(depositAmount);

  function onOpenChange(next: boolean) {
    if (pending) return;
    // Judged when the dialog opens, so the warning matches the clock.
    if (next) {
      setOutcome(
        cancellationOutcome({ paymentStatus, startAt, freeCancellationHours }),
      );
      setAcknowledged(false);
      setError(undefined);
    }
    setOpen(next);
  }

  function cancel() {
    setError(undefined);
    startTransition(async () => {
      const result = await cancelMyBookingAction(rentalId);
      if (!result.success) {
        setError(result.message);
        return;
      }
      setOpen(false);
      toast.success(
        result.data?.reservationFeeForfeited
          ? "Booking cancelled. The reservation fee is not refunded."
          : result.data?.paid
            ? "Booking cancelled. We'll message you to arrange your refund."
            : "Booking cancelled.",
      );
      router.refresh();
    });
  }

  const forfeited = outcome === "forfeited";

  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline">
          <XCircle />
          Cancel booking
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="data-[size=default]:sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogMedia
            className={forfeited ? "bg-destructive/10 text-destructive" : undefined}
          >
            <XCircle />
          </AlertDialogMedia>
          <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
          <AlertDialogDescription>
            The car is released for other renters. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {outcome === "forfeited" ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Your {fee} reservation fee will not be refunded</AlertTitle>
            <AlertDescription>
              Pick-up is less than {hoursPhrase(hours)} away. Under the
              cancellation policy you agreed to when booking, cancelling now
              keeps the reservation fee.
            </AlertDescription>
          </Alert>
        ) : outcome === "refundable" ? (
          <Alert>
            <Info />
            <AlertTitle>Your {fee} reservation fee is refundable</AlertTitle>
            <AlertDescription>
              You are cancelling more than {hoursPhrase(hours)} before pick-up.
              We will message you to arrange the refund.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <Info />
            <AlertDescription>
              Nothing has been paid on this booking, so there is nothing to
              refund.
            </AlertDescription>
          </Alert>
        )}

        {forfeited ? (
          <Field orientation="horizontal">
            <Checkbox
              checked={acknowledged}
              disabled={pending}
              id={acknowledgeId}
              onCheckedChange={(checked) => setAcknowledged(checked === true)}
            />
            <FieldLabel className="font-normal" htmlFor={acknowledgeId}>
              I understand I will not get the {fee} reservation fee back.
            </FieldLabel>
          </Field>
        ) : null}

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep booking</AlertDialogCancel>
          <Button
            disabled={pending || (forfeited && !acknowledged)}
            onClick={cancel}
            type="button"
            variant="destructive"
          >
            {pending ? <Spinner /> : null}
            {pending ? "Cancelling…" : "Cancel booking"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
