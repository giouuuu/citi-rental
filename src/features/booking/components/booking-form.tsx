"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, CircleCheck, ClipboardCheck, Info } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import {
  createPublicBookingAction,
  type CreatePublicBookingResult,
} from "@/features/booking/actions/create-public-booking-action";
import { LoginForm } from "@/components/auth/login-form";
import { BookingDateRangeCalendar } from "@/features/booking/components/booking-date-range-calendar";
import {
  BookingNotesField,
  BookingPhotoField,
  BookingTextField,
} from "@/features/booking/components/booking-form-fields";
import {
  clearBookingDraft,
  saveBookingDraft,
  takeBookingDraft,
} from "@/features/booking/lib/booking-draft";
import { compressBookingPhoto } from "@/features/booking/lib/compress-booking-photo";
import { BookingTermsField } from "@/features/booking/components/booking-terms-field";
import { BookingVehicleSummary } from "@/features/booking/components/booking-vehicle-summary";
import { DrivingModeToggle } from "@/features/booking/components/driving-mode-toggle";
import type { DrivingMode } from "@/features/booking/lib/driving-mode";
import {
  idPhotoCopy,
  publicBookingSchema,
} from "@/features/booking/schemas/public-booking-schema";
import type { PublicVehicleBookedRange } from "@/features/booking/services/list-public-vehicle-booked-ranges";
import type { PublicFleetVehicle } from "@/features/vehicles/types/public-fleet-vehicle";
import {
  earliestManilaDateTimeInput,
  parseManilaDateTimeInput,
  toManilaDateTimeInput,
} from "@/features/shared/lib/manila-time";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  /**
   * Guests fill in the whole form; pressing Confirm saves it in this browser
   * and asks them to sign in, which brings them back here to send it.
   */
  signedIn: boolean;
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
  signedIn,
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
  /** Where sign-in returns to; set when a guest presses Confirm. */
  const [signInNext, setSignInNext] = useState<string>();
  const [draftSaved, setDraftSaved] = useState(true);
  const [restored, setRestored] = useState(false);
  const restoreStarted = useRef(false);
  const submitRowRef = useRef<HTMLDivElement>(null);

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
      acceptTerms: false,
    },
  });

  const startAt = form.watch("startAt");
  const expectedReturnAt = form.watch("expectedReturnAt");
  const drivingMode = form.watch("drivingMode") ?? "self-drive";
  const withDriver = drivingMode === "with-driver";
  const idCopy = idPhotoCopy[drivingMode];

  useEffect(() => {
    onDatesChange?.({ start: startAt ?? "", end: expectedReturnAt ?? "" });
  }, [onDatesChange, startAt, expectedReturnAt]);

  // Back from sign-in: put back what the guest typed, photos included. The
  // ref keeps a Strict Mode re-run from taking (and so losing) the draft twice.
  useEffect(() => {
    if (!signedIn || restoreStarted.current) return;
    restoreStarted.current = true;
    void takeBookingDraft<BookingFormValues>(vehicle.id).then((draft) => {
      if (!draft) return;
      const current = form.getValues();
      form.reset({
        ...current,
        ...draft,
        vehicleId: vehicle.id,
        fullName: draft.fullName || current.fullName,
        // The booking always goes out under the signed-in account's email.
        email: initialEmail ?? draft.email ?? "",
      });
      setRestored(true);
      submitRowRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, [signedIn, vehicle.id, initialEmail, form]);

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
      if (!signedIn) {
        setDraftSaved(
          await saveBookingDraft(vehicle.id, {
            ...form.getValues(),
            ...photos,
          }),
        );
        setSignInNext(`${window.location.pathname}${window.location.search}`);
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
        void clearBookingDraft();
        const params = new URLSearchParams({
          ref: next.data.referenceNumber,
        });
        router.push(`/book/pay/${next.data.rentalId}?${params.toString()}`);
      }
    });
  }

  return (
    <>
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
            onChange={(mode) => {
              form.setValue("drivingMode", mode, { shouldDirty: true });
              // The license and ID photo rules follow the mode; refresh any
              // errors already showing so they name the right documents.
              if (form.formState.isSubmitted) {
                void form.trigger([
                  "driversLicenseNumber",
                  "licenseSelfie",
                  "governmentId",
                ]);
              }
            }}
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
            {/* Always the account's email: guests get it when they sign in
                on Confirm, so there is nothing for them to type. */}
            <BookingTextField
              autoComplete="email"
              control={form.control}
              description={
                initialEmail
                  ? "From your account."
                  : "Filled in from the Google account you sign in with."
              }
              disabled={pending}
              label="Email"
              name="email"
              placeholder="Added when you sign in"
              readOnly
              type="email"
            />
            {/* The renter only drives on self-drive. */}
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
            {/* With a driver the ID comes first: the selfie shows that same ID. */}
            {(withDriver
              ? (["governmentId", "licenseSelfie"] as const)
              : (["licenseSelfie", "governmentId"] as const)
            ).map((name) => (
              <BookingPhotoField
                control={form.control}
                description={
                  name === "licenseSelfie"
                    ? idCopy.selfieDescription
                    : idCopy.idDescription
                }
                disabled={pending}
                key={name}
                label={
                  name === "licenseSelfie" ? idCopy.selfieLabel : idCopy.idLabel
                }
                name={name}
                required
              />
            ))}
          </FieldGroup>
        </FieldSet>

        <Alert>
          <ClipboardCheck />
          <AlertTitle>
            {withDriver ? "Booking requirements" : "Self-drive requirements"}
          </AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-4">
              <li>
                {withDriver
                  ? "Bring the government ID shown in your selfie."
                  : "Bring the driver's license shown in your selfie."}
              </li>
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

        <BookingTermsField
          control={form.control}
          disabled={pending}
          freeCancellationHours={freeCancellationHours}
          name="acceptTerms"
        />

        {restored && !result ? (
          <Alert className="border-success/20 bg-success-surface text-success">
            <CircleCheck />
            <AlertTitle>You are signed in</AlertTitle>
            <AlertDescription className="text-success">
              Everything you entered is back, ID photos included. Check it over
              and press Confirm booking.
            </AlertDescription>
          </Alert>
        ) : null}

        {result && !result.success ? (
          <Alert variant="destructive">
            <Info />
            <AlertDescription>{result.message}</AlertDescription>
          </Alert>
        ) : null}

        <div
          className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          data-contact-fab-avoid=""
          ref={submitRowRef}
        >
          <Button asChild variant="ghost">
            <Link href="/#fleet">
              <ArrowLeft />
              Back to fleet
            </Link>
          </Button>
          <div className="flex flex-col gap-1.5 sm:items-end">
            <Button
              className="min-w-44"
              disabled={pending}
              size="lg"
              type="submit"
            >
              {pending ? <Spinner /> : null}
              {pending ? "Booking..." : "Confirm booking"}
            </Button>
            {signedIn ? null : (
              <p className="text-xs text-muted-foreground">
                You will sign in next to send it.
              </p>
            )}
          </div>
        </div>
      </form>

      {/* Outside the booking form: the login form's submit would otherwise
        bubble through the portal and submit the booking too. */}
      <Dialog
        onOpenChange={(open) => {
          if (!open) setSignInNext(undefined);
        }}
        open={Boolean(signInNext)}
      >
        <DialogContent className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Sign in to send your booking</DialogTitle>
            <DialogDescription>
              {draftSaved
                ? `Your details for ${vehicle.name} are saved. After you sign in you come back here with everything filled in.`
                : "This browser could not save your details, so you may need to enter them again after you sign in."}
            </DialogDescription>
          </DialogHeader>
          {signInNext ? <LoginForm embedded nextPath={signInNext} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
