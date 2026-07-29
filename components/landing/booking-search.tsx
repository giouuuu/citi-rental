"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, MapPin } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";

import { BookingDatePicker } from "@/components/landing/booking-date-picker";
import {
  bookingSearchSchema,
  todayDateValue,
  type BookingSearchInput,
} from "@/components/landing/booking-search-schema";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type BookingSearchProps = {
  initialPickup?: string;
  initialStart?: string;
  initialEnd?: string;
  initialMode?: string;
};

export function BookingSearch({
  initialPickup = "",
  initialStart = "",
  initialEnd = "",
  initialMode = "self-drive",
}: BookingSearchProps) {
  const router = useRouter();
  const [mode, setMode] = useState(
    initialMode === "with-driver" ? "with-driver" : "self-drive",
  );

  const today = todayDateValue();
  const pickupDefault =
    initialStart && initialStart >= today ? initialStart : "";
  const returnDefault =
    initialEnd && initialEnd >= (pickupDefault || today) ? initialEnd : "";

  const form = useForm<BookingSearchInput>({
    resolver: zodResolver(bookingSearchSchema),
    defaultValues: {
      pickupLocation: initialPickup,
      pickupDate: pickupDefault,
      returnDate: returnDefault,
    },
  });

  const pickupDate = useWatch({ control: form.control, name: "pickupDate" });

  function onSubmit(values: BookingSearchInput) {
    const params = new URLSearchParams();
    params.set("pickup", values.pickupLocation);
    params.set("start", values.pickupDate);
    params.set("end", values.returnDate);
    if (mode) params.set("mode", mode);
    router.push(`/?${params.toString()}#fleet`);
    document.getElementById("fleet")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <section
      aria-labelledby="find-a-car-title"
      className="overflow-hidden rounded-xl border border-border bg-card"
      id="find-a-car"
    >
      <div className="flex flex-col gap-4 border-b border-border px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-teal-700 uppercase">
            Start your trip
          </p>
          <h2 id="find-a-car-title" className="mt-0.5 text-lg font-bold text-brand-950">
            Find a car for your dates
          </h2>
        </div>

        <Tabs
          className="w-full lg:max-w-xs"
          onValueChange={setMode}
          value={mode}
        >
          <TabsList className="h-11! w-full rounded-lg bg-muted p-1">
            <TabsTrigger className="h-full" value="self-drive">
              Self-drive
            </TabsTrigger>
            <TabsTrigger className="h-full" value="with-driver">
              With driver
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <form
        className="p-5 sm:p-6 lg:p-8"
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <FieldGroup className="grid gap-5 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-start">
          <Controller
            control={form.control}
            name="pickupLocation"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="pickup-location">Pick-up location</FieldLabel>
                <InputGroup
                  aria-invalid={fieldState.invalid}
                  className="h-12!"
                >
                  <InputGroupAddon align="inline-start">
                    <MapPin aria-hidden="true" className="text-teal-600" />
                  </InputGroupAddon>
                  <InputGroupInput
                    {...field}
                    aria-invalid={fieldState.invalid}
                    id="pickup-location"
                    placeholder="Airport, city, or hotel"
                  />
                </InputGroup>
                {fieldState.invalid ? (
                  <FieldError errors={[fieldState.error]} />
                ) : null}
              </Field>
            )}
          />

          <Controller
            control={form.control}
            name="pickupDate"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="pickup-date">Pick-up date</FieldLabel>
                <BookingDatePicker
                  aria-invalid={fieldState.invalid}
                  id="pickup-date"
                  minDate={today}
                  onChange={field.onChange}
                  placeholder="Pick-up date"
                  value={field.value}
                />
                {fieldState.invalid ? (
                  <FieldError errors={[fieldState.error]} />
                ) : null}
              </Field>
            )}
          />

          <Controller
            control={form.control}
            name="returnDate"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="return-date">Return date</FieldLabel>
                <BookingDatePicker
                  aria-invalid={fieldState.invalid}
                  id="return-date"
                  minDate={pickupDate && pickupDate >= today ? pickupDate : today}
                  onChange={field.onChange}
                  placeholder="Return date"
                  value={field.value}
                />
                {fieldState.invalid ? (
                  <FieldError errors={[fieldState.error]} />
                ) : null}
              </Field>
            )}
          />

          <Field>
            <FieldLabel aria-hidden="true" className="invisible select-none">
              Submit
            </FieldLabel>
            <Button className="h-12 px-6" size="lg" type="submit">
              Show available cars
              <ArrowRight aria-hidden="true" />
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </section>
  );
}
