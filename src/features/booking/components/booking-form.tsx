"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ClipboardCheck, Info, UserRoundCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { type Resolver, useForm } from "react-hook-form";
import type { z } from "zod";

import {
  createPublicBookingAction,
  type CreatePublicBookingResult,
} from "@/features/booking/actions/create-public-booking-action";
import { BookingDateRangeCalendar } from "@/features/booking/components/booking-date-range-calendar";
import {
  BookingNotesField,
  BookingPhotoField,
  BookingTextField,
} from "@/features/booking/components/booking-form-fields";
import { compressBookingPhoto } from "@/features/booking/lib/compress-booking-photo";
import { BookingVehicleSummary } from "@/features/booking/components/booking-vehicle-summary";
import type { ResolvedBookingContact } from "@/features/booking/lib/booking-contact";
import {
  publicBookingSchema,
  returningBookingSchema,
} from "@/features/booking/schemas/public-booking-schema";
import type { PublicVehicleBookedRange } from "@/features/booking/services/list-public-vehicle-booked-ranges";
import type { PublicFleetVehicle } from "@/features/vehicles/types/public-fleet-vehicle";
import {
  parseManilaDateTimeInput,
  toManilaDateTimeInput,
} from "@/features/shared/lib/manila-time";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import {
  applyServerFieldErrors,
  valuesToFormData,
} from "@/features/shared/lib/form-utils";

type BookingFormValues = z.input<typeof publicBookingSchema>;
type BookingFormOutput = z.output<typeof publicBookingSchema>;

type BookingFormProps = {
  vehicle: PublicFleetVehicle;
  bookedRanges?: PublicVehicleBookedRange[];
  initialStartAt?: string;
  initialReturnAt?: string;
  initialPickupLocation?: string;
  initialFullName?: string;
  initialEmail?: string;
  /** Guest contact from the lookup step; absent for signed-in customers. */
  contact?: ResolvedBookingContact;
  onChangeContact?: () => void;
};

function toDateTimeLocalValue(value?: string) {
  if (!value) return "";
  // A bare day from the landing search is a calendar day, not UTC midnight.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T09:00`;
  const local = toManilaDateTimeInput(value);
  return parseManilaDateTimeInput(local) ? local : "";
}

export function BookingForm({
  vehicle,
  bookedRanges = [],
  initialStartAt,
  initialReturnAt,
  initialPickupLocation,
  initialFullName,
  initialEmail,
  contact,
  onChangeContact,
}: BookingFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<CreatePublicBookingResult>();
  const returning = contact?.returning === true;
  const lockedField =
    contact?.kind === "email"
      ? "email"
      : contact?.kind === "phone"
        ? "phoneNumber"
        : null;

  const form = useForm<BookingFormValues, unknown, BookingFormOutput>({
    // Same fields either way; the returning schema only relaxes identity
    // fields, which that mode hides and the RPC fills from the record.
    resolver: returning
      ? (zodResolver(
          returningBookingSchema,
        ) as unknown as Resolver<
          BookingFormValues,
          unknown,
          BookingFormOutput
        >)
      : zodResolver(publicBookingSchema),
    defaultValues: {
      vehicleId: vehicle.id,
      startAt: toDateTimeLocalValue(initialStartAt),
      expectedReturnAt: toDateTimeLocalValue(initialReturnAt),
      fullName: initialFullName ?? "",
      phoneNumber: contact?.kind === "phone" ? contact.value : "",
      email: contact?.kind === "email" ? contact.value : (initialEmail ?? ""),
      driversLicenseNumber: "",
      address: "",
      facebookAccount: "",
      pickupLocation: initialPickupLocation ?? "",
      returnLocation: initialPickupLocation ?? "",
      destination: "",
      passengerCount: "",
      notes: "",
    },
  });

  const startAt = form.watch("startAt");
  const expectedReturnAt = form.watch("expectedReturnAt");

  function onSubmit(values: BookingFormOutput) {
    setResult(undefined);
    startTransition(async () => {
      let photos: { licenseSelfie: File; governmentId: File };
      try {
        const [licenseSelfie, governmentId] = await Promise.all([
          compressBookingPhoto(values.licenseSelfie),
          compressBookingPhoto(values.governmentId),
        ]);
        photos = { licenseSelfie, governmentId };
      } catch {
        setResult({
          success: false,
          message: "We could not read one of your ID photos. Try a JPEG or PNG photo.",
        });
        return;
      }
      const next = await createPublicBookingAction(
        valuesToFormData(
          { ...values, ...photos },
          returning ? { returning: "1" } : undefined,
        ),
      );
      setResult(next);
      if (!next.success && next.fieldErrors) {
        applyServerFieldErrors(form.setError, next.fieldErrors);
      }
      if (next.success && next.data) {
        const params = new URLSearchParams({
          ref: next.data.referenceNumber,
        });
        router.push(`/book/pay/${next.data.rentalId}?${params.toString()}`);
      }
    });
  }

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <input type="hidden" {...form.register("vehicleId")} />
      <BookingVehicleSummary
        expectedReturnAt={expectedReturnAt}
        startAt={startAt}
        vehicle={vehicle}
      />

      <BookingDateRangeCalendar
        bookedRanges={bookedRanges}
        control={form.control}
        disabled={pending}
        returnName="expectedReturnAt"
        startName="startAt"
      />

      {returning && contact ? (
        <Alert>
          <UserRoundCheck />
          <AlertTitle>
            Welcome back{contact.initial ? `, ${contact.initial}•••` : ""}
          </AlertTitle>
          <AlertDescription>
            <p>
              We found your details for{" "}
              <span className="font-medium text-foreground">
                {contact.value}
              </span>
              . We will use the name, phone, address, and license on file —
              just add your trip details and ID photos.
            </p>
            {onChangeContact ? (
              <Button
                className="h-auto p-0"
                disabled={pending}
                onClick={onChangeContact}
                type="button"
                variant="link"
              >
                Not you? Use a different email or number
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {returning ? null : (
        <FieldSet>
          <FieldLegend>Your details</FieldLegend>
          <FieldGroup className="grid items-start gap-4 sm:grid-cols-2">
            <BookingTextField
              autoComplete="name"
              control={form.control}
              disabled={pending}
              label="Full name"
              name="fullName"
              placeholder="Alex Rivera"
              required
            />
            <BookingTextField
              autoComplete="tel"
              control={form.control}
              description={
                lockedField === "phoneNumber" ? (
                  <ChangeContactLink
                    disabled={pending}
                    onClick={onChangeContact}
                  />
                ) : undefined
              }
              disabled={pending}
              label="Contact number"
              name="phoneNumber"
              placeholder="+63 917 000 0000"
              readOnly={lockedField === "phoneNumber"}
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
            <BookingTextField
              autoComplete="email"
              control={form.control}
              description={
                lockedField === "email" ? (
                  <ChangeContactLink
                    disabled={pending}
                    onClick={onChangeContact}
                  />
                ) : undefined
              }
              disabled={pending}
              label={lockedField === "email" ? "Email" : "Email (optional)"}
              name="email"
              placeholder="you@email.com"
              readOnly={lockedField === "email"}
              required={lockedField === "email"}
              type="email"
            />
            <BookingTextField
              control={form.control}
              disabled={pending}
              label="Driver's license number"
              name="driversLicenseNumber"
              required
            />
          </FieldGroup>
        </FieldSet>
      )}

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
              vehicle.seating_capacity
                ? `This car seats ${vehicle.seating_capacity}.`
                : undefined
            }
            disabled={pending}
            inputMode="numeric"
            label="Number of passengers"
            name="passengerCount"
            placeholder="e.g. 4"
            required
            type="number"
          />
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Renter IDs</FieldLegend>
        <FieldGroup className="grid items-start gap-4 sm:grid-cols-2">
          <BookingPhotoField
            control={form.control}
            description="A clear selfie of you holding your driver's license."
            disabled={pending}
            label="Selfie with driver's license"
            name="licenseSelfie"
            required
          />
          <BookingPhotoField
            control={form.control}
            description="Passport, UMID, PhilSys, SSS, or another government ID."
            disabled={pending}
            label="Another government ID"
            name="governmentId"
            required
          />
        </FieldGroup>
      </FieldSet>

      <Alert>
        <ClipboardCheck />
        <AlertTitle>Self-drive requirements</AlertTitle>
        <AlertDescription>
          <ul className="list-disc space-y-1 pl-4">
            <li>Bring the driver&apos;s license shown in your selfie.</li>
            <li>Return the car washed, or pay the wash rate.</li>
            <li>Return the car with the same fuel level.</li>
            <li>
              Delivery and pick-up are charged per way, depending on the
              location.
            </li>
          </ul>
        </AlertDescription>
      </Alert>

      <BookingNotesField
        control={form.control}
        disabled={pending}
        name="notes"
      />

      {result && !result.success ? (
        <Alert variant="destructive">
          <Info />
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button asChild variant="ghost">
          <Link href="/#fleet">
            <ArrowLeft />
            Back to fleet
          </Link>
        </Button>
        <Button className="min-w-44" disabled={pending} size="lg" type="submit">
          {pending ? <Spinner /> : null}
          {pending ? "Booking..." : "Confirm booking"}
        </Button>
      </div>
    </form>
  );
}

function ChangeContactLink({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick?: () => void;
}) {
  if (!onClick) return null;
  return (
    <Button
      className="h-auto p-0 text-xs"
      disabled={disabled}
      onClick={onClick}
      type="button"
      variant="link"
    >
      Change
    </Button>
  );
}
