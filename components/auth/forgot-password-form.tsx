"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";

import { forgotPasswordAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  forgotPasswordSchema,
  type ForgotPasswordInput,
} from "@/features/auth/schemas/login-schema";
import {
  applyServerFieldErrors,
  valuesToFormData,
} from "@/features/shared/lib/form-utils";

export function ForgotPasswordForm() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string>();
  const [success, setSuccess] = useState(false);

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  function onSubmit(values: ForgotPasswordInput) {
    setMessage(undefined);
    setSuccess(false);
    startTransition(async () => {
      const result = await forgotPasswordAction(valuesToFormData(values));
      if (result.errors) {
        applyServerFieldErrors(form.setError, result.errors);
      }
      if (result.message) {
        setMessage(result.message);
        setSuccess(Boolean(result.success));
      }
    });
  }

  return (
    <div>
      <Button asChild className="-ml-3 mb-6" variant="ghost">
        <Link href="/login">
          <ArrowLeft /> Back to sign in
        </Link>
      </Button>
      <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
        Account recovery
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em]">Reset your password</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Enter your staff email and we will send a secure reset link.
      </p>
      <form
        className="mt-8 space-y-5"
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <FieldGroup>
          <Controller
            control={form.control}
            name="email"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="email">Email address</FieldLabel>
                <Input
                  {...field}
                  aria-invalid={fieldState.invalid}
                  autoComplete="email"
                  id="email"
                  placeholder="you@company.com"
                  type="email"
                />
                {fieldState.invalid ? (
                  <FieldError errors={[fieldState.error]} />
                ) : null}
              </Field>
            )}
          />
        </FieldGroup>
        {message ? (
          <div
            className={
              success
                ? "flex gap-2 rounded-md bg-success-surface p-3 text-sm text-success"
                : "rounded-md bg-warning-surface p-3 text-sm text-warning"
            }
            role="status"
          >
            {success ? <CheckCircle2 className="size-4 shrink-0" /> : null}
            {message}
          </div>
        ) : null}
        <Button className="w-full" disabled={pending} size="lg" type="submit">
          {pending ? <Spinner /> : null}
          {pending ? "Sending..." : "Send reset link"}
        </Button>
      </form>
    </div>
  );
}
