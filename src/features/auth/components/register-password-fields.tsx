"use client";

import { Controller, type Control, useWatch } from "react-hook-form";
import type { z } from "zod";

import { PasswordRequirementsChecklist } from "@/features/auth/components/password-requirements-checklist";
import { registerSchema } from "@/features/auth/schemas/register-schema";
import { PasswordInput } from "@/components/auth/password-input";
import {
  Field,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterPasswordFields({
  control,
  pending,
}: {
  control: Control<RegisterFormValues>;
  pending: boolean;
}) {
  const password = useWatch({ control, name: "password" }) ?? "";

  return (
    <>
      {(["password", "confirmPassword"] as const).map((name) => (
        <Controller
          control={control}
          key={name}
          name={name}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={name}>
                {name === "password" ? "Password" : "Confirm password"}
              </FieldLabel>
              <PasswordInput
                {...field}
                aria-describedby={
                  [
                    name === "password" ? "password-requirements" : undefined,
                    fieldState.invalid ? `${name}-error` : undefined,
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
                aria-invalid={fieldState.invalid}
                autoComplete="new-password"
                className="h-11"
                disabled={pending}
                id={name}
              />
              {name === "password" ? (
                <PasswordRequirementsChecklist password={password} />
              ) : null}
              {fieldState.invalid ? (
                <FieldError errors={[fieldState.error]} id={`${name}-error`} />
              ) : null}
            </Field>
          )}
        />
      ))}
    </>
  );
}
