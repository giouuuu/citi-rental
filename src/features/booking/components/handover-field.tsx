"use client";

import { MapPin } from "lucide-react";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
  useWatch,
} from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  BookingTextField,
  RequiredMark,
} from "@/features/booking/components/booking-form-fields";
import {
  type DeliveryFees,
  HANDOVER_METHODS,
  type HandoverLeg,
  handoverLabel,
  handoverPrice,
  handoverShortLabel,
  parseHandoverMethod,
} from "@/features/booking/lib/handover";

const legCopy = {
  pickup: {
    legend: "Where do you get the car?",
    addressLabel: "Delivery address",
    addressPlaceholder: "Hotel, airport, or full address",
    office: "Pick up and sign at",
  },
  return: {
    legend: "Where do you return it?",
    addressLabel: "Collection address",
    addressPlaceholder: "Where we collect the car",
    office: "Drop the car off at",
  },
} as const;

/**
 * One end of the trip: at the office (free) or delivered / collected within
 * or outside Cebu City at the per-way fee from Settings. A delivery asks for
 * the address; at the office there is nothing to type.
 */
export function HandoverField<T extends FieldValues, TOut extends FieldValues = T>({
  control,
  leg,
  methodName,
  locationName,
  fees,
  officeAddress,
  disabled,
  compact = false,
  legend,
}: {
  control: Control<T, unknown, TOut>;
  leg: HandoverLeg;
  methodName: FieldPath<T>;
  locationName: FieldPath<T>;
  fees: DeliveryFees | null;
  /** Settings → operating address; shown when the customer picks the office. */
  officeAddress?: string | null;
  disabled?: boolean;
  /** Three across at every width with short labels; the legend names the leg. */
  compact?: boolean;
  /** Replaces the leg's question, e.g. when it also sets the return. */
  legend?: string;
}) {
  const copy = legCopy[leg];
  const method = parseHandoverMethod(useWatch({ control, name: methodName }));

  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      <Controller
        control={control}
        name={methodName}
        render={({ field, fieldState }) => (
          <FieldSet data-invalid={fieldState.invalid}>
            <FieldLegend variant="label">
              {legend ?? copy.legend}
              <RequiredMark />
            </FieldLegend>
            <RadioGroup
              aria-invalid={fieldState.invalid}
              className={
                compact ? "grid grid-cols-3 gap-2" : "grid gap-2 sm:grid-cols-3"
              }
              disabled={disabled}
              name={field.name}
              onValueChange={field.onChange}
              value={field.value ?? ""}
            >
              {HANDOVER_METHODS.map((option) => {
                const id = `${String(methodName)}-${option}`;
                return (
                  <FieldLabel
                    className={
                      compact
                        ? "cursor-pointer has-focus-visible:ring-2 has-focus-visible:ring-ring/40 has-data-[state=checked]:border-primary has-data-[state=checked]:ring-1 has-data-[state=checked]:ring-primary"
                        : undefined
                    }
                    htmlFor={id}
                    key={option}
                  >
                    <Field
                      className={compact ? "min-h-16" : undefined}
                      orientation="horizontal"
                    >
                      <FieldContent className={compact ? "gap-0.5" : undefined}>
                        <FieldTitle className={compact ? "text-sm leading-tight" : undefined}>
                          {compact
                            ? handoverShortLabel(option)
                            : handoverLabel(leg, option)}
                        </FieldTitle>
                        <FieldDescription className="tabular-nums">
                          {compact
                            ? handoverPrice(option, fees)
                                .replace(" per way", "/way")
                                .replace("Fee confirmed by staff", "Staff quote")
                            : handoverPrice(option, fees)}
                        </FieldDescription>
                      </FieldContent>
                      <RadioGroupItem
                        aria-invalid={fieldState.invalid}
                        className={compact ? "sr-only" : undefined}
                        id={id}
                        value={option}
                      />
                    </Field>
                  </FieldLabel>
                );
              })}
            </RadioGroup>
            {fieldState.invalid ? (
              <FieldError errors={[fieldState.error]} />
            ) : null}
          </FieldSet>
        )}
      />

      {method && method !== "office" ? (
        <BookingTextField
          control={control}
          disabled={disabled}
          label={copy.addressLabel}
          name={locationName}
          placeholder={copy.addressPlaceholder}
          required
        />
      ) : null}
      {method === "office" && officeAddress ? (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0 text-teal-600" />
          <span>
            {copy.office} {officeAddress}
          </span>
        </p>
      ) : null}
    </div>
  );
}
