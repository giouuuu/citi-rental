"use client";

import { CalendarDays } from "lucide-react";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import {
  Field,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function BookingTextField<T extends FieldValues>({
  control,
  name,
  label,
  disabled,
  placeholder,
  type = "text",
  withCalendarIcon = false,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  disabled?: boolean;
  placeholder?: string;
  type?: string;
  withCalendarIcon?: boolean;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={String(name)}>{label}</FieldLabel>
          <div className={withCalendarIcon ? "relative" : undefined}>
            {withCalendarIcon ? (
              <CalendarDays className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-teal-600" />
            ) : null}
            <Input
              {...field}
              aria-invalid={fieldState.invalid}
              className={withCalendarIcon ? "h-11 pl-10" : "h-11"}
              disabled={disabled}
              id={String(name)}
              placeholder={placeholder}
              type={type}
              value={field.value ?? ""}
            />
          </div>
          {fieldState.invalid ? (
            <FieldError errors={[fieldState.error]} />
          ) : null}
        </Field>
      )}
    />
  );
}

export function BookingNotesField<T extends FieldValues>({
  control,
  name,
  disabled,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  disabled?: boolean;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={String(name)}>Notes (optional)</FieldLabel>
          <Textarea
            {...field}
            disabled={disabled}
            id={String(name)}
            rows={3}
            value={field.value ?? ""}
          />
          {fieldState.invalid ? (
            <FieldError errors={[fieldState.error]} />
          ) : null}
        </Field>
      )}
    />
  );
}
