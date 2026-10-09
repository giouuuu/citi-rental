"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays, MapPin, Search } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";

import { BookingDatePicker } from "@/components/landing/booking-date-picker";
import { HeroCarSummary } from "@/components/landing/hero-fleet";
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
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

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

  const cellClassName =
    "flex items-start gap-3 rounded-xl px-4 py-3 transition-colors focus-within:bg-brand-50 hover:bg-brand-50/60 md:px-5";
  const iconClassName = "mt-0.5 size-5 shrink-0 text-muted-foreground";

  return (
    <section
      aria-labelledby="find-a-car-title"
      className="mx-auto w-full max-w-5xl scroll-mt-24"
      id="find-a-car"
    >
      <h2 className="sr-only" id="find-a-car-title">
        Find a car for your dates
      </h2>

      <form
        className="rounded-2xl bg-card p-2 shadow-[0_30px_60px_-30px_rgb(7_17_31/0.3)] ring-1 ring-brand-950/[0.06]"
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 pt-1.5 pb-1 md:px-4">
          <Tabs onValueChange={setMode} value={mode}>
            <TabsList className="h-8! rounded-full bg-brand-950/[0.05] p-0.5">
              <TabsTrigger
                className="h-full rounded-full px-3 text-xs"
                value="self-drive"
              >
                Self-drive
              </TabsTrigger>
              <TabsTrigger
                className="h-full rounded-full px-3 text-xs"
                value="with-driver"
              >
                With driver
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <HeroCarSummary />
        </div>

        <FieldGroup className="grid grid-cols-2 gap-0 md:grid-cols-[1.3fr_1fr_1fr_auto] md:items-center">
          <Controller
            control={form.control}
            name="pickupLocation"
            render={({ field, fieldState }) => (
              <div className={cn(cellClassName, "col-span-2 md:col-span-1")}>
                <MapPin aria-hidden="true" className={iconClassName} />
                <Field className="gap-1" data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="pickup-location">Location</FieldLabel>
                  <Input
                    {...field}
                    aria-invalid={fieldState.invalid}
                    className="h-auto border-0 bg-transparent p-0 text-base text-brand-950 shadow-none placeholder:text-muted-foreground focus-visible:ring-0 aria-invalid:ring-0 md:text-sm"
                    id="pickup-location"
                    placeholder="Airport, hotel, or address"
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : null}
                </Field>
              </div>
            )}
          />

          <Controller
            control={form.control}
            name="pickupDate"
            render={({ field, fieldState }) => (
              <div className={cn(cellClassName, dividerClassName)}>
                <CalendarDays aria-hidden="true" className={iconClassName} />
                <Field className="gap-1" data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="pickup-date">Pick-up date</FieldLabel>
                  <BookingDatePicker
                    appearance="inline"
                    aria-invalid={fieldState.invalid}
                    id="pickup-date"
                    minDate={today}
                    onChange={field.onChange}
                    placeholder="Add date"
                    value={field.value}
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : null}
                </Field>
              </div>
            )}
          />

          <Controller
            control={form.control}
            name="returnDate"
            render={({ field, fieldState }) => (
              <div className={cn(cellClassName, dividerClassName, "border-l")}>
                <CalendarDays aria-hidden="true" className={iconClassName} />
                <Field className="gap-1" data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="return-date">Return date</FieldLabel>
                  <BookingDatePicker
                    appearance="inline"
                    aria-invalid={fieldState.invalid}
                    id="return-date"
                    minDate={
                      pickupDate && pickupDate >= today ? pickupDate : today
                    }
                    onChange={field.onChange}
                    placeholder="Add date"
                    value={field.value}
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : null}
                </Field>
              </div>
            )}
          />

          <div className="col-span-2 p-2 md:col-span-1 md:pl-3">
            <Button
              className="h-12 w-full rounded-xl px-6 md:w-auto"
              size="lg"
              type="submit"
            >
              <Search aria-hidden="true" className="size-4" />
              Search cars
            </Button>
          </div>
        </FieldGroup>
      </form>
    </section>
  );
}

/** Hairline between cells: a top rule when stacked, a left rule in the row.
 *  On phones the two dates share a row, so return also gets a left rule. */
const dividerClassName =
  "rounded-none border-t border-border md:rounded-xl md:border-t-0 md:border-l";
