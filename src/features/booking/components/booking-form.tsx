"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Info } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import {
  createPublicBookingAction,
  type CreatePublicBookingResult,
} from "@/features/booking/actions/create-public-booking-action";
import {
  BookingNotesField,
  BookingTextField,
} from "@/features/booking/components/booking-form-fields";
import { BookingVehicleSummary } from "@/features/booking/components/booking-vehicle-summary";
import { publicBookingSchema } from "@/features/booking/schemas/public-booking-schema";
import type { PublicFleetVehicle } from "@/features/vehicles/types/public-fleet-vehicle";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import {
  applyServerFieldErrors,
  valuesToFormData,
} from "@/features/shared/lib/form-utils";

type BookingFormValues = z.input<typeof publicBookingSchema>;

type BookingFormProps = {
  vehicle: PublicFleetVehicle;
  initialStartAt?: string;
  initialReturnAt?: string;
  initialPickupLocation?: string;
  initialFullName?: string;
  initialEmail?: string;
};

function toDateTimeLocalValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T09:00` : "";
  }
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function BookingForm({
  vehicle,
  initialStartAt,
  initialReturnAt,
  initialPickupLocation,
  initialFullName,
  initialEmail,
}: BookingFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<CreatePublicBookingResult>();

  const form = useForm<BookingFormValues>({
    resolver: zodResolver(publicBookingSchema),
    defaultValues: {
      vehicleId: vehicle.id,
      startAt: toDateTimeLocalValue(initialStartAt),
      expectedReturnAt: toDateTimeLocalValue(initialReturnAt),
      fullName: initialFullName ?? "",
      phoneNumber: "",
      email: initialEmail ?? "",
      driversLicenseNumber: "",
      pickupLocation: initialPickupLocation ?? "",
      returnLocation: initialPickupLocation ?? "",
      notes: "",
    },
  });

  const startAt = form.watch("startAt");
  const expectedReturnAt = form.watch("expectedReturnAt");

  function onSubmit(values: BookingFormValues) {
    setResult(undefined);
    startTransition(async () => {
      const next = await createPublicBookingAction(valuesToFormData(values));
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

      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <BookingTextField
          control={form.control}
          disabled={pending}
          label="Pick-up date & time"
          name="startAt"
          type="datetime-local"
          withCalendarIcon
        />
        <BookingTextField
          control={form.control}
          disabled={pending}
          label="Return date & time"
          name="expectedReturnAt"
          type="datetime-local"
          withCalendarIcon
        />
        <BookingTextField
          control={form.control}
          disabled={pending}
          label="Full name"
          name="fullName"
          placeholder="Alex Rivera"
        />
        <BookingTextField
          control={form.control}
          disabled={pending}
          label="Phone number"
          name="phoneNumber"
          placeholder="+63 917 000 0000"
          type="tel"
        />
        <BookingTextField
          control={form.control}
          disabled={pending}
          label="Email (optional)"
          name="email"
          placeholder="you@email.com"
          type="email"
        />
        <BookingTextField
          control={form.control}
          disabled={pending}
          label="Driver license number"
          name="driversLicenseNumber"
        />
        <BookingTextField
          control={form.control}
          disabled={pending}
          label="Pick-up location"
          name="pickupLocation"
          placeholder="Airport, city, or hotel"
        />
        <BookingTextField
          control={form.control}
          disabled={pending}
          label="Return location"
          name="returnLocation"
          placeholder="Same as pick-up"
        />
      </FieldGroup>

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
