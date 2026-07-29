"use client";

import { Controller, type Control, type FieldValues } from "react-hook-form";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  ResourceField,
  ResourceOption,
  ResourceRow,
} from "@/features/shared/types/resource";

export function ResourceFormField({
  control,
  definitionKey,
  fieldDef,
  options,
  row,
  readOnly,
  isPending,
}: {
  control: Control<FieldValues>;
  definitionKey: string;
  fieldDef: ResourceField;
  options: ResourceOption[];
  row?: ResourceRow | null;
  readOnly: boolean;
  isPending: boolean;
}) {
  const id = `${definitionKey}-${fieldDef.name}`;

  return (
    <Controller
      control={control}
      name={fieldDef.name}
      render={({ field, fieldState }) => (
        <Field className={fieldDef.className} data-invalid={fieldState.invalid}>
          {fieldDef.type === "checkbox" ? (
            <div className="flex min-h-12 items-start gap-3 rounded-md border bg-muted/30 p-3">
              <Checkbox
                aria-invalid={fieldState.invalid}
                checked={Boolean(field.value)}
                disabled={readOnly || isPending}
                id={id}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
              <div>
                <FieldLabel htmlFor={id}>{fieldDef.label}</FieldLabel>
                {fieldDef.description ? (
                  <FieldDescription>{fieldDef.description}</FieldDescription>
                ) : null}
              </div>
            </div>
          ) : fieldDef.type === "image" ? (
            <div className="space-y-3">
              <FieldLabel htmlFor={id}>{fieldDef.label}</FieldLabel>
              {typeof row?.photo_url === "string" && row.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt="Current photo"
                  className="h-40 w-full max-w-sm rounded-lg border object-cover"
                  src={row.photo_url}
                />
              ) : null}
              <Input
                accept={
                  fieldDef.accept ?? "image/jpeg,image/png,image/webp,image/gif"
                }
                aria-invalid={fieldState.invalid}
                disabled={readOnly || isPending}
                id={id}
                onBlur={field.onBlur}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  field.onChange(file ?? undefined);
                }}
                ref={field.ref}
                type="file"
              />
              {fieldDef.description ? (
                <FieldDescription>{fieldDef.description}</FieldDescription>
              ) : null}
            </div>
          ) : (
            <>
              <FieldLabel htmlFor={id}>
                {fieldDef.label}
                {fieldDef.required ? (
                  <span aria-hidden="true" className="text-destructive">
                    *
                  </span>
                ) : null}
              </FieldLabel>
              {fieldDef.type === "textarea" ? (
                <Textarea
                  aria-invalid={fieldState.invalid}
                  disabled={readOnly || isPending}
                  id={id}
                  name={field.name}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                  placeholder={fieldDef.placeholder}
                  ref={field.ref}
                  rows={4}
                  value={String(field.value ?? "")}
                />
              ) : fieldDef.type === "select" ? (
                <Select
                  disabled={readOnly || isPending}
                  onValueChange={field.onChange}
                  value={String(field.value ?? "")}
                >
                  <SelectTrigger
                    aria-invalid={fieldState.invalid}
                    className="h-11! w-full"
                    id={id}
                  >
                    <SelectValue
                      placeholder={`Select ${fieldDef.label.toLowerCase()}`}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  aria-invalid={fieldState.invalid}
                  disabled={readOnly || isPending}
                  id={id}
                  name={field.name}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                  placeholder={fieldDef.placeholder}
                  ref={field.ref}
                  required={fieldDef.required}
                  step={fieldDef.step}
                  type={fieldDef.type ?? "text"}
                  value={String(field.value ?? "")}
                />
              )}
              {fieldDef.description ? (
                <FieldDescription>{fieldDef.description}</FieldDescription>
              ) : null}
            </>
          )}
          {fieldState.invalid ? (
            <FieldError errors={[fieldState.error]} />
          ) : null}
        </Field>
      )}
    />
  );
}
