"use client";

import { CalendarDays, ImageUp } from "lucide-react";
import { type ReactNode, useEffect, useMemo } from "react";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** Red asterisk after a required field's label; the input carries aria-required. */
export function RequiredMark() {
  return (
    <span aria-hidden="true" className="text-destructive">
      *
    </span>
  );
}

export function BookingTextField<T extends FieldValues, TOut extends FieldValues = T>({
  control,
  name,
  label,
  disabled,
  readOnly,
  required,
  description,
  placeholder,
  type = "text",
  inputMode,
  autoComplete,
  className,
  withCalendarIcon = false,
}: {
  control: Control<T, unknown, TOut>;
  name: FieldPath<T>;
  label: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  description?: ReactNode;
  placeholder?: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  className?: string;
  withCalendarIcon?: boolean;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field className={className} data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={String(name)}>
            {label}
            {required ? <RequiredMark /> : null}
          </FieldLabel>
          <div className={withCalendarIcon ? "relative" : undefined}>
            {withCalendarIcon ? (
              <CalendarDays className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-teal-600" />
            ) : null}
            <Input
              {...field}
              aria-invalid={fieldState.invalid}
              aria-required={required || undefined}
              autoComplete={autoComplete}
              className={withCalendarIcon ? "h-11 pl-10" : "h-11"}
              disabled={disabled}
              id={String(name)}
              inputMode={inputMode}
              placeholder={placeholder}
              readOnly={readOnly}
              type={type}
              value={field.value ?? ""}
            />
          </div>
          {description ? (
            <FieldDescription>{description}</FieldDescription>
          ) : null}
          {fieldState.invalid ? (
            <FieldError errors={[fieldState.error]} />
          ) : null}
        </Field>
      )}
    />
  );
}

export function BookingNotesField<T extends FieldValues, TOut extends FieldValues = T>({
  control,
  name,
  disabled,
}: {
  control: Control<T, unknown, TOut>;
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

/**
 * One image upload held as a File in form state. Shows a thumbnail so the
 * renter can check the photo is readable before submitting.
 */
export function BookingPhotoField<T extends FieldValues, TOut extends FieldValues = T>({
  control,
  name,
  label,
  description,
  disabled,
  required,
}: {
  control: Control<T, unknown, TOut>;
  name: FieldPath<T>;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={String(name)}>
            {label}
            {required ? <RequiredMark /> : null}
          </FieldLabel>
          {description ? (
            <FieldDescription>{description}</FieldDescription>
          ) : null}
          <PhotoPreview
            file={
              (field.value as unknown) instanceof File
                ? (field.value as File)
                : null
            }
          />
          <Input
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            aria-invalid={fieldState.invalid}
            aria-required={required || undefined}
            className="h-11 py-2"
            disabled={disabled}
            id={String(name)}
            name={field.name}
            onBlur={field.onBlur}
            onChange={(event) => field.onChange(event.target.files?.[0])}
            ref={field.ref}
            type="file"
          />
          {fieldState.invalid ? (
            <FieldError errors={[fieldState.error]} />
          ) : null}
        </Field>
      )}
    />
  );
}

function PhotoPreview({ file }: { file: File | null }) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return (
    <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/40">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className="size-full object-contain" src={url} />
      ) : (
        <ImageUp aria-hidden="true" className="size-8 text-muted-foreground" />
      )}
    </div>
  );
}
