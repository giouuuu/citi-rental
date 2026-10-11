"use client";

import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info, PencilLine } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { updateMyBookingDetailsAction } from "@/features/booking/actions/update-my-booking-details-action";
import { BookingTextField } from "@/features/booking/components/booking-form-fields";
import { bookingDetailsSchema } from "@/features/booking/schemas/public-booking-schema";
import type { CustomerBookingDetail } from "@/features/booking/types/customer-booking-detail";
import { applyServerFieldErrors } from "@/features/shared/lib/form-utils";

type DetailsValues = z.input<typeof bookingDetailsSchema>;
type DetailsOutput = z.output<typeof bookingDetailsSchema>;

function defaultsFor(booking: CustomerBookingDetail): DetailsValues {
  return {
    rentalId: booking.id,
    drivingMode: booking.withDriver ? "with-driver" : "self-drive",
    fullName: booking.customer.fullName ?? "",
    phoneNumber: booking.customer.phoneNumber ?? "",
    address: booking.customer.address ?? "",
    facebookAccount: booking.customer.facebookAccount ?? "",
    driversLicenseNumber: booking.customer.driversLicenseNumber ?? "",
    pickupLocation: booking.pickupLocation ?? "",
    returnLocation: booking.returnLocation ?? "",
    destination: booking.destination ?? "",
    passengerCount:
      booking.passengerCount != null ? String(booking.passengerCount) : "",
  };
}

/**
 * Fix what was typed into the booking form while the booking is unpaid. The
 * car, dates and driving mode set the price and hold, so changing those means
 * cancelling and booking again.
 */
export function EditBookingDetailsDialog({
  booking,
}: {
  booking: CustomerBookingDetail;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const withDriver = booking.withDriver;
  const seats = booking.vehicle.seatingCapacity;

  const form = useForm<DetailsValues, unknown, DetailsOutput>({
    resolver: zodResolver(bookingDetailsSchema),
    defaultValues: defaultsFor(booking),
  });

  function onOpenChange(next: boolean) {
    if (pending) return;
    // Opens on what is saved now, not on an earlier unsaved try.
    if (next) {
      form.reset(defaultsFor(booking));
      setError(undefined);
    }
    setOpen(next);
  }

  function onSubmit(values: DetailsOutput) {
    setError(undefined);
    startTransition(async () => {
      const result = await updateMyBookingDetailsAction({
        ...values,
        passengerCount: String(values.passengerCount),
      });
      if (!result.success) {
        if (result.fieldErrors) {
          applyServerFieldErrors(form.setError, result.fieldErrors);
        }
        setError(result.message);
        return;
      }
      setOpen(false);
      toast.success("Booking details saved.");
      router.refresh();
    });
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          <PencilLine />
          Edit details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[min(90vh,760px)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit booking details</DialogTitle>
          <DialogDescription>
            You can change these until you pay the reservation fee. To change
            the car, dates or driving, cancel and book again.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-5"
          noValidate
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <FieldSet>
            <FieldLegend>Your details</FieldLegend>
            <FieldGroup className="grid items-start gap-4 sm:grid-cols-2">
              <BookingTextField
                autoComplete="name"
                control={form.control}
                disabled={pending}
                label="Full name"
                name="fullName"
                required
              />
              <BookingTextField
                autoComplete="tel"
                control={form.control}
                disabled={pending}
                label="Contact number"
                name="phoneNumber"
                required
                type="tel"
              />
              <BookingTextField
                autoComplete="street-address"
                className="sm:col-span-2"
                control={form.control}
                disabled={pending}
                label="Address"
                name="address"
                placeholder="House no., street, barangay, city"
                required
              />
              <BookingTextField
                control={form.control}
                disabled={pending}
                label="Facebook account"
                name="facebookAccount"
                placeholder="Name or facebook.com/… link"
                required
              />
              {withDriver ? null : (
                <BookingTextField
                  control={form.control}
                  disabled={pending}
                  label="Driver's license number"
                  name="driversLicenseNumber"
                  required
                />
              )}
            </FieldGroup>
          </FieldSet>

          <FieldSet>
            <FieldLegend>Trip details</FieldLegend>
            <FieldGroup className="grid items-start gap-4 sm:grid-cols-2">
              <BookingTextField
                control={form.control}
                disabled={pending}
                label="Pick-up / delivery location"
                name="pickupLocation"
                placeholder="Airport, hotel, or address"
                required
              />
              <BookingTextField
                control={form.control}
                disabled={pending}
                label="Return location"
                name="returnLocation"
                placeholder="Where we collect the car"
                required
              />
              <BookingTextField
                control={form.control}
                disabled={pending}
                label="Destination"
                name="destination"
                placeholder="e.g. Moalboal, Oslob"
                required
              />
              <BookingTextField
                control={form.control}
                description={
                  seats
                    ? withDriver
                      ? `With a driver, this car seats ${seats - 1}.`
                      : `This car seats ${seats}.`
                    : undefined
                }
                disabled={pending}
                inputMode="numeric"
                label="Number of passengers"
                name="passengerCount"
                required
                type="number"
              />
            </FieldGroup>
          </FieldSet>

          {error ? (
            <Alert variant="destructive">
              <Info />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button
              disabled={pending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button disabled={pending} type="submit">
              {pending ? <Spinner /> : null}
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
