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
}: {
  control: Control<T, unknown, TOut>;
  leg: HandoverLeg;
  methodName: FieldPath<T>;
  locationName: FieldPath<T>;
  fees: DeliveryFees | null;
  /** Settings → operating address; shown when the customer picks the office. */
  officeAddress?: string | null;
  disabled?: boolean;
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
              {copy.legend}
              <RequiredMark />
            </FieldLegend>
            <RadioGroup
              aria-invalid={fieldState.invalid}
              className="grid gap-2 sm:grid-cols-3"
              disabled={disabled}
              name={field.name}
              onValueChange={field.onChange}
              value={field.value ?? ""}
            >
              {HANDOVER_METHODS.map((option) => {
                const id = `${String(methodName)}-${option}`;
                return (
                  <FieldLabel htmlFor={id} key={option}>
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>{handoverLabel(leg, option)}</FieldTitle>
                        <FieldDescription className="tabular-nums">
                          {handoverPrice(option, fees)}
                        </FieldDescription>
                      </FieldContent>
                      <RadioGroupItem
                        aria-invalid={fieldState.invalid}
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
