"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ClipboardCheck, Info } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
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
import { DrivingModeToggle } from "@/features/booking/components/driving-mode-toggle";
import type { DrivingMode } from "@/features/booking/lib/driving-mode";
import { publicBookingSchema } from "@/features/booking/schemas/public-booking-schema";
import type { PublicVehicleBookedRange } from "@/features/booking/services/list-public-vehicle-booked-ranges";
import type { PublicFleetVehicle } from "@/features/vehicles/types/public-fleet-vehicle";
import {
  earliestManilaDateTimeInput,
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
  /** The car was just switched and its booked days are still on the way. */
  bookedRangesLoading?: boolean;
  /** Hears every change to the chosen dates, e.g. to check them against the car. */
  onDatesChange?: (dates: { start: string; end: string }) => void;
  initialStartAt?: string;
  initialReturnAt?: string;
  initialPickupLocation?: string;
  /** From the landing search or the car dialog (`?mode=with-driver`). */
  initialDrivingMode?: DrivingMode;
  /** Settings → driver day rate; null means staff quote the driver. */
  driverDailyRate?: number | null;
  initialFullName?: string;
  /** The signed-in account's email; the booking always uses it. */
  initialEmail?: string;
  /** Flat fee to hold the booking, from Settings. */
  reservationFee?: number | null;
  /** Settings → free-cancellation window; states the refund policy. */
  freeCancellationHours?: number | null;
};

function toDateTimeLocalValue(value?: string) {
  if (!value) return "";
  // A bare day from the landing search is a calendar day, not UTC midnight.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T09:00`;
  const local = toManilaDateTimeInput(value);
  return parseManilaDateTimeInput(local) ? local : "";
}

/** A pick-up carried in from the URL that has already passed moves to now. */
function notBeforeNow(value: string) {
  const earliest = earliestManilaDateTimeInput(new Date());
  return value && value < earliest ? earliest : value;
}

export function BookingForm({
  vehicle,
  bookedRanges = [],
  bookedRangesLoading = false,
  onDatesChange,
  initialStartAt,
  initialReturnAt,
  initialPickupLocation,
  initialDrivingMode = "self-drive",
  driverDailyRate,
  initialFullName,
  initialEmail,
  reservationFee,
  freeCancellationHours,
}: BookingFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<CreatePublicBookingResult>();

  const form = useForm<BookingFormValues, unknown, BookingFormOutput>({
    resolver: zodResolver(publicBookingSchema),
    defaultValues: {
      vehicleId: vehicle.id,
      drivingMode: initialDrivingMode,
      startAt: notBeforeNow(toDateTimeLocalValue(initialStartAt)),
      expectedReturnAt: toDateTimeLocalValue(initialReturnAt),
      fullName: initialFullName ?? "",
      phoneNumber: "",
      email: initialEmail ?? "",
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
  const drivingMode = form.watch("drivingMode") ?? "self-drive";
  const withDriver = drivingMode === "with-driver";

  useEffect(() => {
    onDatesChange?.({ start: startAt ?? "", end: expectedReturnAt ?? "" });
  }, [onDatesChange, startAt, expectedReturnAt]);

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
          message:
            "We could not read one of your ID photos. Try a JPEG or PNG photo.",
        });
        return;
      }
      const next = await createPublicBookingAction(
        // The car can be switched above the form after it mounted.
        valuesToFormData({ ...values, vehicleId: vehicle.id, ...photos }),
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
        freeCancellationHours={freeCancellationHours}
        reservationFee={reservationFee}
        startAt={startAt}
        vehicle={vehicle}
        withDriver={withDriver ? { rate: driverDailyRate ?? null } : null}
      />

      <FieldSet>
        <FieldLegend>Driving</FieldLegend>
        <DrivingModeToggle
          disabled={pending}
          driverDailyRate={driverDailyRate}
          onChange={(mode) =>
            form.setValue("drivingMode", mode, { shouldDirty: true })
          }
          value={drivingMode}
        />
        <p className="text-sm text-muted-foreground">
          {withDriver
            ? driverDailyRate
              ? "A local driver who knows Cebu drives you for the whole trip. Their day rate is in your total."
              : "A local driver who knows Cebu drives you for the whole trip. Staff confirm the driver fee with you."
            : "You drive. Bring your valid driver's license to pickup."}
        </p>
      </FieldSet>

      <BookingDateRangeCalendar
        bookedRanges={bookedRanges}
        control={form.control}
        disabled={pending || bookedRangesLoading}
        returnName="expectedReturnAt"
        startName="startAt"
      />

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
            disabled={pending}
            label="Contact number"
            name="phoneNumber"
            placeholder="+63 917 000 0000"
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
            description={initialEmail ? "From your account." : undefined}
            disabled={pending}
            label={initialEmail ? "Email" : "Email (optional)"}
            name="email"
            placeholder="you@email.com"
            readOnly={Boolean(initialEmail)}
            required={Boolean(initialEmail)}
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
                ? withDriver
                  ? `With a driver, this car seats ${vehicle.seating_capacity - 1}.`
                  : `This car seats ${vehicle.seating_capacity}.`
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
