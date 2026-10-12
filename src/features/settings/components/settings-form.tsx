"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Save, TriangleAlert } from "lucide-react";
import { Controller, useForm } from "react-hook-form";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveSettingsAction } from "@/features/settings/actions/actions";
import { PaymentQrUpload } from "@/features/settings/components/payment-qr-upload";
import {
  CONTACT_CHANNEL_KEYS,
  contactChannelField,
  contactChannelSettings,
} from "@/features/settings/lib/contact-channels";
import { DEFAULT_THANK_YOU_MESSAGE } from "@/features/settings/lib/review-links";
import {
  settingsSchema,
  type SettingsInput,
} from "@/features/settings/schemas/settings-schema";
import type { OrganizationSettings } from "@/features/settings/services/settings-service";
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";
import {
  applyServerFieldErrors,
  valuesToFormData,
} from "@/features/shared/lib/form-utils";
import type { ActionResult } from "@/features/shared/types/resource";
import type { z } from "zod";
import { toast } from "sonner";

type SettingsFormValues = z.input<typeof settingsSchema>;
type SettingsParsed = z.output<typeof settingsSchema>;
type ReviewLinkName = "review_google_url" | "review_facebook_url";
type TextFieldName =
  | "name"
  | "timezone"
  | "tracker_online_threshold_minutes"
  | "tracker_delayed_threshold_minutes"
  | "location_retention_days";

const GPS_PROVIDER_OPTIONS = [
  { value: "simulator", label: "Simulator" },
  { value: "traccar", label: "Traccar" },
];

export function SettingsForm({ settings }: { settings: OrganizationSettings }) {
  const [state, setState] = useState<ActionResult | null>(null);
  const { isPending, runMutation } = useMutationCoordinator();
  const router = useRouter();

  const form = useForm<SettingsFormValues, unknown, SettingsParsed>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      name: settings.name,
      timezone: settings.timezone,
      tracker_online_threshold_minutes: settings.tracker_online_threshold_minutes,
      tracker_delayed_threshold_minutes:
        settings.tracker_delayed_threshold_minutes,
      location_retention_days: settings.location_retention_days,
      gps_provider: settings.gps_provider as SettingsInput["gps_provider"],
      reservation_fee: settings.reservation_fee,
      driver_daily_rate: settings.driver_daily_rate,
      driver_hours_per_day: settings.driver_hours_per_day,
      driver_overtime_hourly_rate: settings.driver_overtime_hourly_rate,
      delivery_fee_within_city: settings.delivery_fee_within_city,
      delivery_fee_outside_city: settings.delivery_fee_outside_city,
      free_cancellation_hours: settings.free_cancellation_hours,
      turnaround_minutes: settings.turnaround_minutes,
      payment_instructions: settings.payment_instructions,
      operating_address: settings.operating_address,
      review_google_url: settings.review_google_url,
      review_facebook_url: settings.review_facebook_url,
      review_thank_you_message: settings.review_thank_you_message,
      ...Object.fromEntries(
        CONTACT_CHANNEL_KEYS.map(contactChannelField).map((column) => [
          column,
          settings[column],
        ]),
      ),
    },
  });

  function onSubmit(values: SettingsParsed) {
    runMutation(async () => {
      const result = await saveSettingsAction(valuesToFormData(values));
      setState(result);
      if (!result.success && result.fieldErrors) {
        applyServerFieldErrors(form.setError, result.fieldErrors);
      }
      if (result.success) {
        toast.success("Settings saved.");
        router.refresh();
      }
    });
  }

  function renderTextField(
    name: TextFieldName,
    label: string,
    type: "text" | "number",
  ) {
    return (
      <Controller
        control={form.control}
        key={name}
        name={name}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={name}>{label}</FieldLabel>
            <Input
              {...field}
              aria-invalid={fieldState.invalid}
              disabled={isPending}
              id={name}
              min={type === "number" ? 1 : undefined}
              onChange={(event) =>
                field.onChange(
                  type === "number"
                    ? event.target.valueAsNumber
                    : event.target.value,
                )
              }
              type={type}
              value={
                field.value === undefined || field.value === null
                  ? ""
                  : String(field.value)
              }
            />
            {fieldState.invalid ? (
              <FieldError errors={[fieldState.error]} />
            ) : null}
          </Field>
        )}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization and tracking defaults</CardTitle>
        <CardDescription>
          Thresholds apply consistently to tracker status and retention
          workflows.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-5"
          noValidate
          onSubmit={form.handleSubmit(onSubmit)}
        >
          {/* Success is a toast; only failures stay pinned next to the fields. */}
          {state && !state.success ? (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>Unable to save</AlertTitle>
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          ) : null}
          <FieldGroup className="grid items-start gap-5 md:grid-cols-2">
            {(
              [
                ["name", "Organization name", "text"],
                ["timezone", "Timezone", "text"],
              ] as const
            ).map(([name, label, type]) => renderTextField(name, label, type))}
            <Controller
              control={form.control}
              name="operating_address"
              render={({ field, fieldState }) => (
                <Field className="md:col-span-2" data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="operating_address">
                    Operating address
                  </FieldLabel>
                  <Input
                    {...field}
                    aria-invalid={fieldState.invalid}
                    autoComplete="off"
                    disabled={isPending}
                    id="operating_address"
                    placeholder="Garage or office where the cars are kept, e.g. Lahug, Cebu City"
                    value={field.value ?? ""}
                  />
                  <FieldDescription>
                    Where the business currently operates. The registered
                    business address on the rental agreement is set separately
                    below.
                  </FieldDescription>
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : null}
                </Field>
              )}
            />
            {(
              [
                [
                  "tracker_online_threshold_minutes",
                  "Online threshold (minutes)",
                  "number",
                ],
                [
                  "tracker_delayed_threshold_minutes",
                  "Delayed threshold (minutes)",
                  "number",
                ],
                [
                  "location_retention_days",
                  "Location retention (days)",
                  "number",
                ],
              ] as const
            ).map(([name, label, type]) => renderTextField(name, label, type))}
            <Controller
              control={form.control}
              name="gps_provider"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="gps_provider">GPS provider</FieldLabel>
                  <Combobox
                    aria-invalid={fieldState.invalid}
                    disabled={isPending}
                    id="gps_provider"
                    onValueChange={field.onChange}
                    options={GPS_PROVIDER_OPTIONS}
                    placeholder="Select a GPS provider"
                    value={field.value}
                  />
                  <FieldDescription>
                    Credentials remain server-only environment variables.
                  </FieldDescription>
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : null}
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="reservation_fee"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="reservation_fee">
                    Reservation fee (₱)
                  </FieldLabel>
                  <Input
                    {...field}
                    aria-invalid={fieldState.invalid}
                    disabled={isPending}
                    id="reservation_fee"
                    min={1}
                    step="0.01"
                    onChange={(event) =>
                      field.onChange(event.target.valueAsNumber)
                    }
                    type="number"
                    value={
                      field.value === undefined || field.value === null
                        ? ""
                        : String(field.value)
                    }
                  />
                  <FieldDescription>
                    Fixed amount an online booking pays to hold the car. Never
                    more than the trip total.
                  </FieldDescription>
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : null}
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="driver_daily_rate"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="driver_daily_rate">
                    Driver daily rate (₱)
                  </FieldLabel>
                  <Input
                    {...field}
                    aria-invalid={fieldState.invalid}
                    disabled={isPending}
                    id="driver_daily_rate"
                    min={0}
                    step="0.01"
                    onChange={(event) =>
                      field.onChange(
                        event.target.value === ""
                          ? null
                          : event.target.valueAsNumber,
                      )
                    }
                    placeholder="Staff quote it"
                    type="number"
                    value={
                      field.value === undefined || field.value === null
                        ? ""
                        : String(field.value)
                    }
                  />
                  <FieldDescription>
                    Added to with-driver bookings for every started 24 hours.
                    Leave empty to quote the driver yourself.
                  </FieldDescription>
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : null}
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="driver_hours_per_day"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="driver_hours_per_day">
                    Driver hours a day
                  </FieldLabel>
                  <Input
                    {...field}
                    aria-invalid={fieldState.invalid}
                    disabled={isPending}
                    id="driver_hours_per_day"
                    min={1}
                    max={24}
                    step="1"
                    onChange={(event) =>
                      field.onChange(
                        event.target.value === ""
                          ? null
                          : event.target.valueAsNumber,
                      )
                    }
                    type="number"
                    value={
                      field.value === undefined || field.value === null
                        ? ""
                        : String(field.value)
                    }
                  />
                  <FieldDescription>
                    How many hours of driving the driver daily rate covers.
                  </FieldDescription>
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : null}
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="driver_overtime_hourly_rate"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="driver_overtime_hourly_rate">
                    Driver overtime (₱ per hour)
                  </FieldLabel>
                  <Input
                    {...field}
                    aria-invalid={fieldState.invalid}
                    disabled={isPending}
                    id="driver_overtime_hourly_rate"
                    min={0}
                    step="0.01"
                    onChange={(event) =>
                      field.onChange(
                        event.target.value === ""
                          ? null
                          : event.target.valueAsNumber,
                      )
                    }
                    placeholder="Not shown"
                    type="number"
                    value={
                      field.value === undefined || field.value === null
                        ? ""
                        : String(field.value)
                    }
                  />
                  <FieldDescription>
                    Each hour past the driver&apos;s day. Shown on the renter&apos;s bill and
                    settled at return, not added to the booking. Leave empty to hide it.
                  </FieldDescription>
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : null}
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="delivery_fee_within_city"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="delivery_fee_within_city">
                    Delivery fee within Cebu City (₱ per way)
                  </FieldLabel>
                  <Input
                    {...field}
                    aria-invalid={fieldState.invalid}
                    disabled={isPending}
                    id="delivery_fee_within_city"
                    min={0}
                    step="0.01"
                    onChange={(event) =>
                      field.onChange(
                        event.target.value === ""
                          ? null
                          : event.target.valueAsNumber,
                      )
                    }
                    placeholder="Staff quote it"
                    type="number"
                    value={
                      field.value === undefined || field.value === null
                        ? ""
                        : String(field.value)
                    }
                  />
                  <FieldDescription>
                    Added when a customer has the car delivered or collected within Cebu City. Charged each way.
                  </FieldDescription>
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : null}
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="delivery_fee_outside_city"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="delivery_fee_outside_city">
                    Delivery fee outside Cebu City (₱ per way)
                  </FieldLabel>
                  <Input
                    {...field}
                    aria-invalid={fieldState.invalid}
                    disabled={isPending}
                    id="delivery_fee_outside_city"
                    min={0}
                    step="0.01"
                    onChange={(event) =>
                      field.onChange(
                        event.target.value === ""
                          ? null
                          : event.target.valueAsNumber,
                      )
                    }
                    placeholder="Staff quote it"
                    type="number"
                    value={
                      field.value === undefined || field.value === null
                        ? ""
                        : String(field.value)
                    }
                  />
                  <FieldDescription>
                    Added when a customer has the car delivered or collected outside Cebu City. Picking up or returning at the office is free.
                  </FieldDescription>
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : null}
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="free_cancellation_hours"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="free_cancellation_hours">
                    Free cancellation (hours before pickup)
                  </FieldLabel>
                  <Input
                    {...field}
                    aria-invalid={fieldState.invalid}
                    disabled={isPending}
                    id="free_cancellation_hours"
                    min={0}
                    max={720}
                    step={1}
                    onChange={(event) =>
                      field.onChange(event.target.valueAsNumber)
                    }
                    type="number"
                    value={
                      field.value === undefined || field.value === null
                        ? ""
                        : String(field.value)
                    }
                  />
                  <FieldDescription>
                    Cancelling closer to pickup than this keeps the paid
                    reservation fee. Shown to customers when they book.
                  </FieldDescription>
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : null}
                </Field>
              )}
            />
            <Controller
              control={form.control}
              name="turnaround_minutes"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="turnaround_minutes">
                    Turnaround between rentals (minutes)
                  </FieldLabel>
                  <Input
                    {...field}
                    aria-invalid={fieldState.invalid}
                    disabled={isPending}
                    id="turnaround_minutes"
                    min={0}
                    max={1440}
                    step={15}
                    onChange={(event) =>
                      field.onChange(event.target.valueAsNumber)
                    }
                    type="number"
                    value={
                      field.value === undefined || field.value === null
                        ? ""
                        : String(field.value)
                    }
                  />
                  <FieldDescription>
                    Time to wash and check a car. With 90, a car back at 7:00
                    AM can go out again from 8:30 AM, and a trip must end 90
                    minutes before its next pick-up. 0 allows back-to-back.
                  </FieldDescription>
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : null}
                </Field>
              )}
            />
            <PaymentQrUpload qrUrl={settings.payment_qr_url} />
            <Controller
              control={form.control}
              name="payment_instructions"
              render={({ field, fieldState }) => (
                <Field className="md:col-span-2" data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="payment_instructions">
                    Payment instructions
                  </FieldLabel>
                  <Textarea
                    {...field}
                    aria-invalid={fieldState.invalid}
                    disabled={isPending}
                    id="payment_instructions"
                    placeholder="GCash name: Zeke Car Rental & Services&#10;Number: 09XX XXX XXXX&#10;Put the booking reference in the note."
                    rows={4}
                    value={field.value ?? ""}
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : null}
                </Field>
              )}
            />
          </FieldGroup>
          <section
            aria-labelledby="contact-channels-title"
            className="space-y-4 border-t pt-5"
          >
            <div>
              <h3 className="text-sm font-medium" id="contact-channels-title">
                Customer contact channels
              </h3>
              <p className="text-sm text-muted-foreground">
                Shown on the public site&apos;s chat button. Fill in the apps
                you answer on; empty ones stay hidden.
              </p>
            </div>
            <FieldGroup className="grid items-start gap-5 md:grid-cols-2">
              {CONTACT_CHANNEL_KEYS.map((key) => {
                const name = contactChannelField(key);
                const channel = contactChannelSettings[key];
                return (
                  <Controller
                    control={form.control}
                    key={name}
                    name={name}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={name}>{channel.label}</FieldLabel>
                        <Input
                          {...field}
                          aria-invalid={fieldState.invalid}
                          autoComplete="off"
                          disabled={isPending}
                          id={name}
                          inputMode={channel.kind === "phone" ? "tel" : undefined}
                          placeholder={channel.placeholder}
                          value={field.value ?? ""}
                        />
                        <FieldDescription>{channel.description}</FieldDescription>
                        {fieldState.invalid ? (
                          <FieldError errors={[fieldState.error]} />
                        ) : null}
                      </Field>
                    )}
                  />
                );
              })}
            </FieldGroup>
          </section>
          <section
            aria-labelledby="after-trip-title"
            className="space-y-4 border-t pt-5"
          >
            <div>
              <h3 className="text-sm font-medium" id="after-trip-title">
                After the trip
              </h3>
              <p className="text-sm text-muted-foreground">
                Once a rental is completed, the renter&apos;s booking page and
                the thank-you email show this note with buttons to review you
                on Google and Facebook. Empty links hide their button.{" "}
                <Link
                  className="font-medium text-foreground underline underline-offset-4"
                  href="/settings/emails"
                >
                  Preview the email
                </Link>
              </p>
            </div>
            <FieldGroup className="grid items-start gap-5 md:grid-cols-2">
              {(
                [
                  [
                    "review_google_url",
                    "Google review link",
                    "https://g.page/r/…/review",
                    "In Google Business Profile, open Ask for reviews and copy the link.",
                  ],
                  [
                    "review_facebook_url",
                    "Facebook review link",
                    "https://www.facebook.com/zekecarrentals/reviews",
                    "Leave empty to use the Facebook page's reviews tab.",
                  ],
                ] as const satisfies readonly (readonly [
                  ReviewLinkName,
                  string,
                  string,
                  string,
                ])[]
              ).map(([name, label, placeholder, description]) => (
                <Controller
                  control={form.control}
                  key={name}
                  name={name}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={name}>{label}</FieldLabel>
                      <Input
                        {...field}
                        aria-invalid={fieldState.invalid}
                        autoComplete="off"
                        disabled={isPending}
                        id={name}
                        inputMode="url"
                        placeholder={placeholder}
                        value={field.value ?? ""}
                      />
                      <FieldDescription>{description}</FieldDescription>
                      {fieldState.invalid ? (
                        <FieldError errors={[fieldState.error]} />
                      ) : null}
                    </Field>
                  )}
                />
              ))}
              <Controller
                control={form.control}
                name="review_thank_you_message"
                render={({ field, fieldState }) => (
                  <Field className="md:col-span-2" data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="review_thank_you_message">
                      Thank-you message
                    </FieldLabel>
                    <Textarea
                      {...field}
                      aria-invalid={fieldState.invalid}
                      disabled={isPending}
                      id="review_thank_you_message"
                      placeholder={DEFAULT_THANK_YOU_MESSAGE}
                      rows={3}
                      value={field.value ?? ""}
                    />
                    <FieldDescription>
                      Leave empty to use the message shown in the box.
                    </FieldDescription>
                    {fieldState.invalid ? (
                      <FieldError errors={[fieldState.error]} />
                    ) : null}
                  </Field>
                )}
              />
            </FieldGroup>
          </section>
          <div className="flex justify-end border-t pt-5">
            <Button disabled={isPending} type="submit">
              {isPending ? <LoaderCircle className="animate-spin" /> : <Save />}
              {isPending ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
