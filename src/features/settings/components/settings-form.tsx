"use client";

import { useState } from "react";
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
import {
  CONTACT_CHANNEL_KEYS,
  contactChannelField,
  contactChannelSettings,
} from "@/features/settings/lib/contact-channels";
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
      free_cancellation_hours: settings.free_cancellation_hours,
      payment_qr_url: settings.payment_qr_url,
      payment_instructions: settings.payment_instructions,
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
          <FieldGroup className="grid gap-5 md:grid-cols-2">
            {(
              [
                ["name", "Organization name", "text"],
                ["timezone", "Timezone", "text"],
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
            ).map(([name, label, type]) => (
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
            ))}
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
              name="payment_qr_url"
              render={({ field, fieldState }) => (
                <Field className="md:col-span-2" data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="payment_qr_url">
                    Payment QR image URL
                  </FieldLabel>
                  <Input
                    {...field}
                    aria-invalid={fieldState.invalid}
                    disabled={isPending}
                    id="payment_qr_url"
                    placeholder="https://.../gcash-qr.png"
                    value={field.value ?? ""}
                  />
                  <FieldDescription>
                    Public image URL of your GCash/Maya/bank QR shown on the
                    deposit page.
                  </FieldDescription>
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : null}
                </Field>
              )}
            />
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
                    placeholder="GCash name: Zeke Car Rentals&#10;Number: 09XX XXX XXXX&#10;Put the booking reference in the note."
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
