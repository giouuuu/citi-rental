"use client";

import { useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";

import { resetPasswordAction } from "@/app/(auth)/actions";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import {
  resetPasswordSchema,
  type ResetPasswordInput,
} from "@/features/auth/schemas/login-schema";
import {
  applyServerFieldErrors,
  valuesToFormData,
} from "@/features/shared/lib/form-utils";

export function ResetPasswordForm() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string>();

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "" },
  });

  function onSubmit(values: ResetPasswordInput) {
    setMessage(undefined);
    startTransition(async () => {
      const result = await resetPasswordAction(valuesToFormData(values));
      if (result.errors) {
        applyServerFieldErrors(form.setError, result.errors);
      }
      if (result.message) setMessage(result.message);
    });
  }

  return (
    <div>
      <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
        Choose a new password
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em]">Secure your account</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Use at least 8 characters. Avoid passwords used on other services.
      </p>
      <form
        className="mt-8 space-y-5"
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <FieldGroup>
          <Controller
            control={form.control}
            name="password"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="password">New password</FieldLabel>
                <PasswordInput
                  {...field}
                  aria-invalid={fieldState.invalid}
                  autoComplete="new-password"
                  id="password"
                />
                {fieldState.invalid ? (
                  <FieldError errors={[fieldState.error]} />
                ) : (
                  <FieldDescription>Minimum 8 characters.</FieldDescription>
                )}
              </Field>
            )}
          />
        </FieldGroup>
        {message ? (
          <p
            className="rounded-md bg-danger-surface p-3 text-sm text-destructive"
            role="alert"
          >
            {message}
          </p>
        ) : null}
        <Button className="w-full" disabled={pending} size="lg" type="submit">
          {pending ? <Spinner /> : null}
          {pending ? "Updating..." : "Update password"}
        </Button>
      </form>
    </div>
  );
}
