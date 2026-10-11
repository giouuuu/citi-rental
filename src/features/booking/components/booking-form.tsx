"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  CircleCheck,
  ClipboardCheck,
  Info,
  Mail,
} from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { type FieldErrors, type FieldPath, useForm } from "react-hook-form";
import type { z } from "zod";

import {
  createPublicBookingAction,
  type CreatePublicBookingResult,
} from "@/features/booking/actions/create-public-booking-action";
import { CONTACT_FAB_AVOID_ATTRIBUTE } from "@/components/landing/contact-fab-avoid";
import {
  checkEmailAction,
  finishEmailCodeSignInAction,
} from "@/features/auth/actions/email-code-actions";
import { EmailCodePanel } from "@/features/auth/components/email-code-panel";
import { suggestEmailCorrection } from "@/features/auth/lib/email-checks";
import {
  type BookingBill,
  BookingBillList,
  bookingBill,
} from "@/features/booking/components/booking-bill";
import { BookingDateRangeCalendar } from "@/features/booking/components/booking-date-range-calendar";
import {
  BookingNotesField,
  BookingPhotoField,
  BookingTextField,
} from "@/features/booking/components/booking-form-fields";
import {
  BOOKING_STEPS,
  BookingSteps,
  type BookingStepId,
} from "@/features/booking/components/booking-steps";
import {
  clearBookingDraft,
  saveBookingDraft,
  takeBookingDraft,
} from "@/features/booking/lib/booking-draft";
import { compressBookingPhoto } from "@/features/booking/lib/compress-booking-photo";
import { BookingTermsField } from "@/features/booking/components/booking-terms-field";
import type { AgreementTerms } from "@/features/agreements/lib/agreement-template";
import { DrivingModeToggle } from "@/features/booking/components/driving-mode-toggle";
import { HandoverField } from "@/features/booking/components/handover-field";
import type { BookingFeeLine } from "@/features/booking/lib/booking-fees";
import {
  type DeliveryFees,
  handoverLabel,
  type HandoverMethod,
  parseHandoverMethod,
} from "@/features/booking/lib/handover";
import type { DrivingMode } from "@/features/booking/lib/driving-mode";
import {
  idPhotoCopy,
  publicBookingSchema,
} from "@/features/booking/schemas/public-booking-schema";
import type { PublicVehicleBookedRange } from "@/features/booking/services/list-public-vehicle-booked-ranges";
import type { PublicFleetVehicle } from "@/features/vehicles/types/public-fleet-vehicle";
import {
  earliestManilaDateTimeInput,
  formatManila,
  parseManilaDateTimeInput,
  toManilaDateTimeInput,
} from "@/features/shared/lib/manila-time";
import { formatPhp } from "@/features/shared/lib/money";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import {
  applyServerFieldErrors,
  valuesToFormData,
} from "@/features/shared/lib/form-utils";
import { cn } from "@/lib/utils";

type BookingFormValues = z.input<typeof publicBookingSchema>;
type BookingFormOutput = z.output<typeof publicBookingSchema>;
type BookingField = FieldPath<BookingFormValues>;

/** What each step checks before the renter moves on. */
const STEP_FIELDS: Record<BookingStepId, BookingField[]> = {
  trip: [
    "drivingMode",
    "startAt",
    "expectedReturnAt",
    "pickupMethod",
    "pickupLocation",
    "returnMethod",
    "returnLocation",
    "destination",
    "passengerCount",
  ],
  you: [
    "fullName",
    "phoneNumber",
    "address",
    "facebookAccount",
    "email",
    "driversLicenseNumber",
    "licenseSelfie",
    "governmentId",
  ],
  review: ["notes", "acceptTerms", "vehicleId"],
};

const STEP_HEADINGS: Record<BookingStepId, string> = {
  trip: "Your trip",
  you: "Your details",
  review: "Review and confirm",
};

/** The first step, in order, holding one of these errors. */
function firstStepWithError(errors: Partial<Record<string, unknown>>) {
  for (const step of BOOKING_STEPS) {
    const field = STEP_FIELDS[step.id].find((name) => errors[name]);
    if (field) return { step: step.id, field };
  }
  return null;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type BookingFormProps = {
  vehicle: PublicFleetVehicle;
  /**
   * Guests fill in the whole form and type their email; pressing Confirm
   * emails them a 6-digit code, and typing it signs them in and sends it.
   */
  signedIn: boolean;
  bookedRanges?: PublicVehicleBookedRange[];
  /** The car was just switched and its booked days are still on the way. */
  bookedRangesLoading?: boolean;
  /** Hears every change to the chosen dates, e.g. to check them against the car. */
  onDatesChange?: (dates: { start: string; end: string }) => void;
  /** The car row above the steps: photos and switching cars. */
  carBar?: ReactNode;
  /** Shown under the calendar, e.g. when the car is taken on those dates. */
  tripNotice?: ReactNode;
  /** The car is booked on part of the chosen trip: the Trip step cannot pass. */
  datesTaken?: boolean;
  initialStartAt?: string;
  initialReturnAt?: string;
  initialPickupLocation?: string;
  /** From the landing search or the car dialog (`?mode=with-driver`). */
  initialDrivingMode?: DrivingMode;
  /** Settings → driver day rate; null means staff quote the driver. */
  driverDailyRate?: number | null;
  /** Settings → per-way delivery fees, priced into the total as picked. */
  deliveryFees?: DeliveryFees | null;
  /** Settings → operating address, shown for an office pick-up or return. */
  officeAddress?: string | null;
  /** Charge types → Car wash; named in the requirements. */
  carWashFee?: number | null;
  /** The wash is in the booking fees: no "return it washed" requirement. */
  carWashIncluded?: boolean;
  /** Charge types added to every online booking; in the total. */
  bookingFees?: BookingFeeLine[];
  initialFullName?: string;
  /** The signed-in account's email; the booking always uses it. */
  initialEmail?: string;
  /** Flat fee to hold the booking, from Settings. */
  reservationFee?: number | null;
  /** Settings → free-cancellation window; states the refund policy. */
  freeCancellationHours?: number | null;
  /** The rental agreement from Settings, shown as the terms to accept. */
  agreementTerms?: AgreementTerms;
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

/**
 * The booking in three steps — Trip, Your details, Review — on one URL. The
 * bar at the bottom keeps the running total next to the main button; on wide
 * screens the same bill stays in view beside the form.
 */
export function BookingForm({
  vehicle,
  signedIn,
  bookedRanges = [],
  bookedRangesLoading = false,
  onDatesChange,
  carBar,
  tripNotice,
  datesTaken = false,
  initialStartAt,
  initialReturnAt,
  initialPickupLocation,
  initialDrivingMode = "self-drive",
  driverDailyRate,
  deliveryFees = null,
  officeAddress,
  carWashFee,
  carWashIncluded = false,
  bookingFees = [],
  initialFullName,
  initialEmail,
  reservationFee,
  freeCancellationHours,
  agreementTerms,
}: BookingFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<CreatePublicBookingResult>();
  /** The email a guest is confirming with a code; opens the code dialog. */
  const [codeEmail, setCodeEmail] = useState<string>();
  /** The checked booking and its compressed photos, sent once the code is in. */
  const pendingBooking = useRef<{
    values: BookingFormOutput;
    photos: { licenseSelfie: File; governmentId: File };
  } | null>(null);
  const [restored, setRestored] = useState(false);
  const [step, setStep] = useState<BookingStepId>("trip");
  /** Most trips end the way they start; the return picker shows on demand. */
  const [sameReturn, setSameReturn] = useState(true);
  const [billOpen, setBillOpen] = useState(false);
  /** Set when a step change should land the cursor on a field. */
  const [focusField, setFocusField] = useState<BookingField | null>(null);
  const restoreStarted = useRef(false);
  const stepMoved = useRef(false);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const tripNoticeRef = useRef<HTMLDivElement>(null);

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
      // No default: office or delivery is the renter's call, and what it costs.
      pickupMethod: undefined,
      returnMethod: undefined,
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
  const pickupMethod = parseHandoverMethod(form.watch("pickupMethod"));
  const returnMethod = parseHandoverMethod(form.watch("returnMethod"));
  const pickupLocation = form.watch("pickupLocation") ?? "";
  const emailValue = form.watch("email") ?? "";
  const emailSuggestion = signedIn ? null : suggestEmailCorrection(emailValue);
  const withDriver = drivingMode === "with-driver";
  const idCopy = idPhotoCopy[drivingMode];
  const bill = bookingBill({
    dailyRate: vehicle.daily_rate,
    start: startAt,
    end: expectedReturnAt,
    withDriver: withDriver ? { rate: driverDailyRate ?? null } : null,
    pickupMethod,
    returnMethod,
    deliveryFees,
    bookingFees,
    reservationFee,
  });

  useEffect(() => {
    onDatesChange?.({ start: startAt ?? "", end: expectedReturnAt ?? "" });
  }, [onDatesChange, startAt, expectedReturnAt]);

  // An error shown by Continue clears (or updates) as soon as the renter
  // fixes that field, instead of waiting for the next Continue.
  useEffect(() => {
    const subscription = form.watch((_values, { name }) => {
      if (name && form.getFieldState(name).error) void form.trigger(name);
    });
    return () => subscription.unsubscribe();
  }, [form]);

  // "Return it the same way" mirrors the pick-up onto the return.
  useEffect(() => {
    if (!sameReturn) return;
    if (pickupMethod) {
      form.setValue("returnMethod", pickupMethod, {
        shouldValidate: form.formState.isSubmitted,
      });
    } else {
      form.resetField("returnMethod");
    }
    form.setValue("returnLocation", pickupLocation);
  }, [sameReturn, pickupMethod, pickupLocation, form]);

  // A new step: bring its top into view and move focus to its heading, or
  // to the field that needs fixing. Skipped on first render.
  useEffect(() => {
    if (!stepMoved.current) return;
    const behavior = prefersReducedMotion() ? "auto" : "smooth";
    if (focusField) {
      form.setFocus(focusField, { shouldSelect: false });
      setFocusField(null);
      return;
    }
    stepHeadingRef.current?.scrollIntoView({ behavior, block: "start" });
    stepHeadingRef.current?.focus({ preventScroll: true });
  }, [step, focusField, form]);

  // Back from sign-in: put back what the guest typed, photos included, and
  // land on Review. The ref keeps a Strict Mode re-run from taking (and so
  // losing) the draft twice.
  useEffect(() => {
    if (!signedIn || restoreStarted.current) return;
    restoreStarted.current = true;
    void takeBookingDraft<BookingFormValues>(vehicle.id).then((draft) => {
      if (!draft) return;
      const current = form.getValues();
      setSameReturn(
        draft.returnMethod === draft.pickupMethod &&
          (draft.returnLocation ?? "") === (draft.pickupLocation ?? ""),
      );
      form.reset({
        ...current,
        ...draft,
        vehicleId: vehicle.id,
        fullName: draft.fullName || current.fullName,
        // The booking always goes out under the signed-in account's email.
        email: initialEmail ?? draft.email ?? "",
      });
      setRestored(true);
      goTo("review");
    });
  }, [signedIn, vehicle.id, initialEmail, form]);

  function goTo(next: BookingStepId, field?: BookingField) {
    stepMoved.current = true;
    setBillOpen(false);
    if (field) setFocusField(field);
    setStep(next);
  }

  /**
   * A guest's email gets the code, so it is required and must be able to
   * receive mail. Signed-in renters book under their account's email.
   */
  async function checkGuestEmail() {
    if (signedIn) return true;
    const email = form.getValues("email")?.trim() ?? "";
    const check = email ? await checkEmailAction(email) : null;
    if (check?.success) return true;
    const message = check
      ? check.message
      : "Enter your email. We send a 6-digit code there to confirm your booking.";
    form.setError("email", { message }, { shouldFocus: true });
    return false;
  }

  async function continueFrom(current: BookingStepId) {
    const valid = await form.trigger(STEP_FIELDS[current], { shouldFocus: true });
    if (!valid) return;
    if (current === "you" && !(await checkGuestEmail())) return;
    if (current === "trip" && datesTaken) {
      tripNoticeRef.current?.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "center",
      });
      return;
    }
    const index = BOOKING_STEPS.findIndex((item) => item.id === current);
    goTo(BOOKING_STEPS[index + 1].id);
  }

  /** Confirm found a problem on an earlier step: open that step at the field. */
  function onInvalid(errors: FieldErrors<BookingFormValues>) {
    const first = firstStepWithError(errors);
    if (first && first.step !== step) goTo(first.step, first.field);
  }

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
        if (!values.email) {
          goTo("you", "email");
          void checkGuestEmail();
          return;
        }
        // Kept in this browser too: if the guest opens the emailed link
        // instead of typing the code, they land back here with it all filled in.
        await saveBookingDraft(vehicle.id, { ...form.getValues(), ...photos });
        pendingBooking.current = { values, photos };
        setCodeEmail(values.email);
        return;
      }
      await sendBooking(values, photos);
    });
  }

  async function sendBooking(
    values: BookingFormOutput,
    photos: { licenseSelfie: File; governmentId: File },
  ) {
    const next = await createPublicBookingAction(
      // The car can be switched above the form after it mounted.
      valuesToFormData({ ...values, vehicleId: vehicle.id, ...photos }),
    );
    setResult(next);
    if (!next.success && next.fieldErrors) {
      applyServerFieldErrors(form.setError, next.fieldErrors);
      const first = firstStepWithError(next.fieldErrors);
      if (first && first.step !== "review") goTo(first.step, first.field);
    }
    if (next.success && next.data) {
      void clearBookingDraft();
      const params = new URLSearchParams({
        ref: next.data.referenceNumber,
      });
      router.push(`/book/pay/${next.data.rentalId}?${params.toString()}`);
    }
    return next;
  }

  /** The code was right: the guest is signed in, so send the booking now. */
  async function onEmailVerified() {
    const booking = pendingBooking.current;
    if (!booking) return "Your booking details were lost. Close this and press Confirm booking again.";
    const finish = await finishEmailCodeSignInAction({
      fullName: booking.values.fullName,
    });
    if (!finish.success) return finish.message;
    const next = await sendBooking(booking.values, booking.photos);
    if (!next.success) {
      // Signed in now: the form's error shows, and Confirm sends directly.
      // The draft goes first so the refresh does not restore over the error.
      await clearBookingDraft();
      setCodeEmail(undefined);
      router.refresh();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (step !== "review") {
      // Enter in a field, or the Continue button: check this step, move on.
      event.preventDefault();
      void continueFrom(step);
      return;
    }
    void form.handleSubmit(onSubmit, onInvalid)(event);
  }

  const stepIndex = BOOKING_STEPS.findIndex((item) => item.id === step);
  const primaryLabel =
    step === "trip"
      ? "Continue"
      : step === "you"
        ? "Review booking"
        : "Confirm booking";

  const summaryProps = {
    bill,
    drivingMode,
    end: expectedReturnAt,
    freeCancellationHours,
    pickupMethod,
    returnMethod,
    start: startAt,
    vehicleName: vehicle.name,
  };

  return (
    <>
      <form
        className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8"
        noValidate
        onSubmit={handleSubmit}
      >
        <input type="hidden" {...form.register("vehicleId")} />

        <div className="min-w-0 space-y-5">
          {carBar}

          <BookingSteps
            current={step}
            disabled={pending}
            onSelect={(target) => goTo(target)}
          />

          <h2
            className="scroll-mt-4 text-lg font-semibold text-brand-950 outline-none"
            ref={stepHeadingRef}
            tabIndex={-1}
          >
            <span className="sr-only">
              Step {stepIndex + 1} of {BOOKING_STEPS.length}:{" "}
            </span>
            {STEP_HEADINGS[step]}
          </h2>

          {step === "trip" ? (
            <div className="space-y-6">
              {signedIn ? null : (
                <p className="flex items-start gap-2 rounded-lg bg-brand-50 px-3 py-2.5 text-sm text-brand-900">
                  <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Three short steps, no account needed. At the end we email
                    you a 6-digit code to confirm it is you.
                  </span>
                </p>
              )}

              <FieldSet>
                <FieldLegend>Driving</FieldLegend>
                <DrivingModeToggle
                  disabled={pending}
                  driverDailyRate={driverDailyRate}
                  onChange={(mode) => {
                    form.setValue("drivingMode", mode, { shouldDirty: true });
                    // The license and ID photo rules follow the mode; refresh
                    // any errors already showing so they name the right documents.
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

              {tripNotice ? <div ref={tripNoticeRef}>{tripNotice}</div> : null}

              <FieldSet>
                <FieldLegend>Pick-up and return</FieldLegend>
                <FieldGroup className="gap-4">
                  <HandoverField
                    compact
                    control={form.control}
                    disabled={pending}
                    fees={deliveryFees}
                    leg="pickup"
                    locationName="pickupLocation"
                    methodName="pickupMethod"
                    officeAddress={officeAddress}
                  />
                  <Field orientation="horizontal">
                    <Checkbox
                      checked={sameReturn}
                      className="size-5"
                      disabled={pending}
                      id="sameReturn"
                      onCheckedChange={(checked) => {
                        const same = checked === true;
                        setSameReturn(same);
                        // Picking the return on its own starts from a blank choice.
                        if (!same) {
                          form.resetField("returnMethod");
                          form.setValue("returnLocation", "");
                        }
                      }}
                    />
                    <FieldContent>
                      <FieldLabel className="font-normal" htmlFor="sameReturn">
                        Return it the same way
                      </FieldLabel>
                      <FieldDescription>
                        {pickupMethod === "office"
                          ? "Drop the car back at our office."
                          : pickupMethod
                            ? "We collect the car from the same address."
                            : "Untick to return it somewhere else."}
                      </FieldDescription>
                    </FieldContent>
                  </Field>
                  {sameReturn ? null : (
                    <HandoverField
                      compact
                      control={form.control}
                      disabled={pending}
                      fees={deliveryFees}
                      leg="return"
                      locationName="returnLocation"
                      methodName="returnMethod"
                      officeAddress={officeAddress}
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
                    required
                    type="number"
                  />
                </FieldGroup>
              </FieldSet>
            </div>
          ) : null}

          {step === "you" ? (
            <div className="space-y-6">
              <FieldSet>
                <FieldLegend className="sr-only">Contact</FieldLegend>
                <FieldGroup className="grid items-start gap-4 sm:grid-cols-2">
                  <BookingTextField
                    autoComplete="name"
                    control={form.control}
                    description="As it appears on your ID."
                    disabled={pending}
                    label="Full name"
                    name="fullName"
                    required
                  />
                  <BookingTextField
                    autoComplete="tel"
                    control={form.control}
                    disabled={pending}
                    inputMode="tel"
                    label="Mobile number"
                    name="phoneNumber"
                    placeholder="09XX XXX XXXX"
                    required
                    type="tel"
                  />
                  <BookingTextField
                    autoComplete="street-address"
                    className="sm:col-span-2"
                    control={form.control}
                    disabled={pending}
                    label="Home address"
                    name="address"
                    placeholder="House no., street, barangay, city"
                    required
                  />
                  <BookingTextField
                    control={form.control}
                    description="So staff can message you on Messenger."
                    disabled={pending}
                    label="Facebook account"
                    name="facebookAccount"
                    placeholder="Your name or facebook.com/… link"
                    required
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
                  {/* Guests type the email their code goes to; signed-in
                      renters always book under their account's email. */}
                  {signedIn ? null : (
                    <BookingTextField
                      autoComplete="email"
                      className="sm:col-span-2"
                      control={form.control}
                      description={
                        emailSuggestion ? (
                          <span className="text-warning">
                            Did you mean{" "}
                            <span className="font-medium break-all">
                              {emailSuggestion}
                            </span>
                            ?{" "}
                            <button
                              className="font-medium text-teal-700 underline underline-offset-4"
                              onClick={() =>
                                form.setValue("email", emailSuggestion, {
                                  shouldValidate: true,
                                })
                              }
                              type="button"
                            >
                              Use this
                            </button>
                          </span>
                        ) : (
                          "We email a 6-digit code here to confirm your booking. No password needed."
                        )
                      }
                      disabled={pending}
                      inputMode="email"
                      label="Email"
                      name="email"
                      placeholder="you@gmail.com"
                      required
                      type="email"
                    />
                  )}
                </FieldGroup>
                {signedIn && initialEmail ? (
                  <p className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Mail aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                    <span>
                      Booking under{" "}
                      <span className="font-medium text-brand-950">
                        {initialEmail}
                      </span>
                      .
                    </span>
                  </p>
                ) : null}
              </FieldSet>

              <FieldSet>
                <FieldLegend>Your IDs</FieldLegend>
                <FieldDescription>
                  Take the photos now or pick them from your gallery.
                </FieldDescription>
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
                        name === "licenseSelfie"
                          ? idCopy.selfieLabel
                          : idCopy.idLabel
                      }
                      name={name}
                      required
                    />
                  ))}
                </FieldGroup>
              </FieldSet>
            </div>
          ) : null}

          {step === "review" ? (
            <div className="space-y-5">
              <ReviewDetails
                address={form.getValues("address")}
                destination={form.getValues("destination")}
                fullName={form.getValues("fullName")}
                onEdit={(target) => goTo(target)}
                passengers={String(form.getValues("passengerCount") ?? "")}
                phone={form.getValues("phoneNumber")}
                pickupLocation={pickupLocation}
                pickupMethod={pickupMethod}
                returnLocation={form.getValues("returnLocation") ?? ""}
                returnMethod={returnMethod}
              />

              {/* Beside the form on wide screens; here on phones. */}
              <div className="rounded-xl border border-border bg-card p-4 lg:hidden">
                <BookingSummary {...summaryProps} showHandover={false} />
              </div>

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
                    {/* Already paid for in the booking fees: nothing to wash. */}
                    {carWashIncluded ? null : (
                      <li>
                        {carWashFee
                          ? `Return the car washed, or pay the ${formatPhp(carWashFee)} car wash fee.`
                          : "Return the car washed, or pay the wash rate."}
                      </li>
                    )}
                    <li>Return the car with the same fuel level.</li>
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
                terms={agreementTerms}
              />

              {restored && !result ? (
                <Alert className="border-success/20 bg-success-surface text-success">
                  <CircleCheck />
                  <AlertTitle>You are signed in</AlertTitle>
                  <AlertDescription className="text-success">
                    Everything you entered is back, ID photos included. Check
                    it over and press Confirm booking.
                  </AlertDescription>
                </Alert>
              ) : null}

              {signedIn ? null : (
                <p className="flex items-start gap-2 rounded-lg bg-teal-50 px-3 py-2.5 text-sm text-teal-700">
                  <Mail aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  <span>
                    When you press Confirm booking, we email a 6-digit code to{" "}
                    <span className="font-medium break-all">
                      {form.getValues("email")}
                    </span>
                    . Type it in to send your booking. No sign-in needed.
                  </span>
                </p>
              )}
            </div>
          ) : null}

          {result && !result.success ? (
            <Alert variant="destructive">
              <Info />
              <AlertDescription>{result.message}</AlertDescription>
            </Alert>
          ) : null}

          <ActionBar
            bill={bill}
            billOpen={billOpen}
            dailyRate={vehicle.daily_rate}
            onBack={
              step === "trip"
                ? null
                : () => goTo(BOOKING_STEPS[stepIndex - 1].id)
            }
            onToggleBill={() => setBillOpen((open) => !open)}
            pending={pending}
            primaryLabel={primaryLabel}
            step={step}
          />
        </div>

        <aside
          aria-label="Booking summary"
          className="hidden rounded-xl border border-border bg-card p-5 lg:sticky lg:top-6 lg:block"
        >
          <BookingSummary {...summaryProps} />
        </aside>
      </form>

      {/* Outside the booking form: the code form's submit would otherwise
        bubble through the portal and submit the booking too. */}
      <Dialog
        onOpenChange={(open) => {
          if (!open) setCodeEmail(undefined);
        }}
        open={Boolean(codeEmail)}
      >
        <DialogContent className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Check your email</DialogTitle>
            <DialogDescription>
              Confirm it is you to send your booking for {vehicle.name}. No
              account or password needed.
            </DialogDescription>
          </DialogHeader>
          {codeEmail ? (
            <EmailCodePanel
              email={codeEmail}
              emailRedirectTo={`${window.location.origin}/auth/callback?next=${encodeURIComponent(
                `${window.location.pathname}${window.location.search}`,
              )}`}
              key={codeEmail}
              onChangeEmail={() => {
                setCodeEmail(undefined);
                goTo("you", "email");
              }}
              onVerified={onEmailVerified}
              verifyLabel="Verify and send booking"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Stays at the bottom of the screen: the running total (tap for the lines)
 * and the step's main button. The chat button steps aside while it shows.
 */
function ActionBar({
  bill,
  billOpen,
  dailyRate,
  step,
  pending,
  primaryLabel,
  onBack,
  onToggleBill,
}: {
  bill: BookingBill | null;
  billOpen: boolean;
  dailyRate: number;
  step: BookingStepId;
  pending: boolean;
  primaryLabel: string;
  onBack: (() => void) | null;
  onToggleBill: () => void;
}) {
  const days = bill
    ? [
        bill.quote.rent.days
          ? `${bill.quote.rent.days} ${bill.quote.rent.days === 1 ? "day" : "days"}`
          : null,
        bill.quote.rent.hours
          ? `${bill.quote.rent.hours} ${bill.quote.rent.hours === 1 ? "hour" : "hours"}`
          : null,
      ]
        .filter(Boolean)
        .join(" ")
    : null;

  return (
    <div
      className="sticky bottom-0 z-20 -mx-4 border-t border-border bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-12px_24px_-20px_rgb(7_17_31/0.45)] backdrop-blur-md sm:mx-0 sm:rounded-t-xl sm:border-x sm:px-5"
      {...{ [CONTACT_FAB_AVOID_ATTRIBUTE]: "" }}
    >
      {billOpen && bill ? (
        <div className="max-h-[45vh] overflow-y-auto pb-3 lg:hidden" id="booking-bill-lines">
          <BookingBillList bill={bill} />
        </div>
      ) : null}
      <div className="flex items-center gap-3">
        {bill ? (
          <button
            aria-controls="booking-bill-lines"
            aria-expanded={billOpen}
            className="-my-1 min-w-0 rounded-md py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 lg:pointer-events-none"
            onClick={onToggleBill}
            type="button"
          >
            <span className="block text-lg leading-tight font-bold text-brand-950 tabular-nums">
              {formatPhp(bill.quote.total)}
            </span>
            <span className="flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground">
              {days}
              <span className="lg:hidden">
                {" · "}
                {billOpen ? "Hide" : "Details"}
              </span>
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "size-3.5 transition-transform duration-200 lg:hidden",
                  billOpen && "rotate-180",
                )}
              />
            </span>
          </button>
        ) : (
          <p className="min-w-0 text-left">
            <span className="block leading-tight font-semibold text-brand-950 tabular-nums">
              {formatPhp(dailyRate)}
              <span className="font-normal text-muted-foreground">/day</span>
            </span>
            <span className="text-xs text-muted-foreground">
              Pick dates for your total
            </span>
          </p>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {onBack ? (
            <Button
              aria-label="Back"
              className="px-2.5 sm:px-4"
              disabled={pending}
              onClick={onBack}
              type="button"
              variant="ghost"
            >
              <ArrowLeft />
              <span className="hidden sm:inline">Back</span>
            </Button>
          ) : (
            <Button asChild className="hidden sm:inline-flex" variant="ghost">
              <Link href="/#fleet">
                <ArrowLeft />
                All cars
              </Link>
            </Button>
          )}
          <Button className="min-w-32" disabled={pending} size="lg" type="submit">
            {pending ? <Spinner /> : null}
            {pending ? "Booking..." : primaryLabel}
            {pending || step === "review" ? null : <ArrowRight />}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The car, the trip and its bill: beside the form, or on Review on phones. */
function BookingSummary({
  vehicleName,
  start,
  end,
  drivingMode,
  pickupMethod,
  returnMethod,
  bill,
  freeCancellationHours,
  showHandover = true,
}: {
  vehicleName: string;
  start?: string;
  end?: string;
  drivingMode: DrivingMode;
  pickupMethod: HandoverMethod | null;
  returnMethod: HandoverMethod | null;
  bill: BookingBill | null;
  freeCancellationHours?: number | null;
  /** Off where the trip details already list pick-up and return. */
  showHandover?: boolean;
}) {
  const startDate = parseManilaDateTimeInput(start);
  const endDate = parseManilaDateTimeInput(end);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold tracking-wider text-teal-700 uppercase">
          Your booking
        </p>
        <p className="mt-1 font-semibold text-brand-950">{vehicleName}</p>
        <p className="text-sm text-muted-foreground">
          {drivingMode === "with-driver" ? "With a driver" : "Self-drive"}
        </p>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">From</dt>
        <dd className="text-brand-950 tabular-nums">
          {startDate ? formatManila(startDate) : "—"}
        </dd>
        <dt className="text-muted-foreground">Until</dt>
        <dd className="text-brand-950 tabular-nums">
          {endDate ? formatManila(endDate) : "—"}
        </dd>
        {showHandover && pickupMethod ? (
          <>
            <dt className="text-muted-foreground">Pick-up</dt>
            <dd className="text-brand-950">{handoverLabel("pickup", pickupMethod)}</dd>
          </>
        ) : null}
        {showHandover && returnMethod ? (
          <>
            <dt className="text-muted-foreground">Return</dt>
            <dd className="text-brand-950">{handoverLabel("return", returnMethod)}</dd>
          </>
        ) : null}
      </dl>
      <div className="border-t border-border pt-4">
        <BookingBillList bill={bill} />
      </div>
      {freeCancellationHours != null && freeCancellationHours > 0 ? (
        <p className="text-xs text-muted-foreground">
          Free cancellation up to {freeCancellationHours} hours before pick-up.
        </p>
      ) : null}
    </div>
  );
}

/** What the renter entered on the first two steps, each with a way back. */
function ReviewDetails({
  pickupMethod,
  pickupLocation,
  returnMethod,
  returnLocation,
  destination,
  passengers,
  fullName,
  phone,
  address,
  onEdit,
}: {
  pickupMethod: HandoverMethod | null;
  pickupLocation: string;
  returnMethod: HandoverMethod | null;
  returnLocation: string;
  destination: string;
  passengers: string;
  fullName: string;
  phone: string;
  address: string;
  onEdit: (step: BookingStepId) => void;
}) {
  const sections: {
    step: BookingStepId;
    title: string;
    rows: [string, string][];
  }[] = [
    {
      step: "trip",
      title: "Trip",
      rows: [
        [
          "Get the car",
          pickupMethod
            ? `${handoverLabel("pickup", pickupMethod)}${pickupMethod !== "office" && pickupLocation ? ` · ${pickupLocation}` : ""}`
            : "—",
        ],
        [
          "Return it",
          returnMethod
            ? `${handoverLabel("return", returnMethod)}${returnMethod !== "office" && returnLocation ? ` · ${returnLocation}` : ""}`
            : "—",
        ],
        ["Destination", destination || "—"],
        ["Passengers", passengers || "—"],
      ],
    },
    {
      step: "you",
      title: "You",
      rows: [
        ["Name", fullName || "—"],
        ["Mobile", phone || "—"],
        ["Address", address || "—"],
      ],
    },
  ];

  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-card">
      {sections.map((section) => (
        <section className="p-4" key={section.step}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-brand-950">{section.title}</h3>
            <Button
              className="-my-1"
              onClick={() => onEdit(section.step)}
              size="sm"
              type="button"
              variant="ghost"
            >
              Edit
              <span className="sr-only"> {section.title.toLowerCase()}</span>
            </Button>
          </div>
          <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
            {section.rows.map(([label, value]) => (
              <div className="contents" key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="break-words text-brand-950">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
