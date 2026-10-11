"use client";

import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info, PencilLine } from "lucide-react";
import { useState, useTransition } from "react";
import { type DefaultValues, useForm, useWatch } from "react-hook-form";
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
import { HandoverField } from "@/features/booking/components/handover-field";
import {
  type DeliveryFees,
  deliveryFee,
  type HandoverMethod,
  parseHandoverMethod,
} from "@/features/booking/lib/handover";
import { bookingDetailsSchema } from "@/features/booking/schemas/public-booking-schema";
import type { CustomerBookingDetail } from "@/features/booking/types/customer-booking-detail";
import { applyServerFieldErrors } from "@/features/shared/lib/form-utils";
import { formatPhp } from "@/features/shared/lib/money";

type DetailsValues = z.input<typeof bookingDetailsSchema>;
type DetailsOutput = z.output<typeof bookingDetailsSchema>;

function defaultsFor(
  booking: CustomerBookingDetail,
): DefaultValues<DetailsValues> {
  return {
    rentalId: booking.id,
    drivingMode: booking.withDriver ? "with-driver" : "self-drive",
    fullName: booking.customer.fullName ?? "",
    phoneNumber: booking.customer.phoneNumber ?? "",
    address: booking.customer.address ?? "",
    facebookAccount: booking.customer.facebookAccount ?? "",
    driversLicenseNumber: booking.customer.driversLicenseNumber ?? "",
    // A booking from before the choice has no method: the renter picks one.
    pickupMethod: booking.pickupMethod ?? undefined,
    returnMethod: booking.returnMethod ?? undefined,
    // At the office the saved location is the office address, not theirs.
    pickupLocation:
      booking.pickupMethod === "office" ? "" : (booking.pickupLocation ?? ""),
    returnLocation:
      booking.returnMethod === "office" ? "" : (booking.returnLocation ?? ""),
    destination: booking.destination ?? "",
    passengerCount:
      booking.passengerCount != null ? String(booking.passengerCount) : "",
  };
}

/**
 * The total after a pick-up or return change, as update_my_booking_details
 * prices it: an unchanged leg keeps its booked fee, a changed one takes
 * today's rate (free with a driver). Null when nothing changes.
 */
function repricedTotal(
  booking: CustomerBookingDetail,
  fees: DeliveryFees | null,
  pickupMethod: HandoverMethod | null,
  returnMethod: HandoverMethod | null,
): number | null {
  const leg = (
    method: HandoverMethod | null,
    bookedMethod: HandoverMethod | null,
    bookedFee: number,
  ) =>
    method === bookedMethod
      ? bookedFee
      : deliveryFee(method, fees, booking.withDriver);
  const next =
    Math.round(
      (booking.quotedTotal -
        booking.pickupDeliveryFee -
        booking.returnDeliveryFee +
        leg(pickupMethod, booking.pickupMethod, booking.pickupDeliveryFee) +
        leg(returnMethod, booking.returnMethod, booking.returnDeliveryFee)) *
        100,
    ) / 100;
  return next === booking.quotedTotal ? null : next;
}

/**
 * Fix what was typed into the booking form while the booking is unpaid,
 * including where the car is picked up and returned (re-priced). The car,
 * dates and driving mode set the price and hold, so changing those means
 * cancelling and booking again.
 */
export function EditBookingDetailsDialog({
  booking,
  deliveryFees = null,
  officeAddress,
}: {
  booking: CustomerBookingDetail;
  /** Settings → per-way delivery fees, to price a changed pick-up or return. */
  deliveryFees?: DeliveryFees | null;
  officeAddress?: string | null;
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

  const pickupMethod = parseHandoverMethod(
    useWatch({ control: form.control, name: "pickupMethod" }),
  );
  const returnMethod = parseHandoverMethod(
    useWatch({ control: form.control, name: "returnMethod" }),
  );
  const newTotal = repricedTotal(booking, deliveryFees, pickupMethod, returnMethod);

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
              <HandoverField
                control={form.control}
                disabled={pending}
                fees={deliveryFees}
                leg="pickup"
                locationName="pickupLocation"
                methodName="pickupMethod"
                officeAddress={officeAddress}
                withDriver={withDriver}
              />
              <HandoverField
                control={form.control}
                disabled={pending}
                fees={deliveryFees}
                leg="return"
                locationName="returnLocation"
                methodName="returnMethod"
                officeAddress={officeAddress}
                withDriver={withDriver}
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

          {newTotal != null ? (
            <Alert>
              <Info />
              <AlertDescription>
                Your new trip total will be{" "}
                <span className="font-semibold text-brand-950 tabular-nums">
                  {formatPhp(newTotal)}
                </span>
                .
              </AlertDescription>
            </Alert>
          ) : null}

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
