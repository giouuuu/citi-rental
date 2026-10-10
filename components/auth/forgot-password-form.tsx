"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
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
  CAPTCHA_LOAD_ERROR,
  useAuthCaptcha,
} from "@/features/auth/components/use-auth-captcha";
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
  const captcha = useAuthCaptcha();

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  function onSubmit(values: ForgotPasswordInput) {
    if (!captcha.ready) return;
    setMessage(undefined);
    setSuccess(false);
    const formData = valuesToFormData(values, { captchaToken: captcha.token ?? "" });
    startTransition(async () => {
      const result = await forgotPasswordAction(formData);
      captcha.reset();
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
      <h1 className="font-display text-[2rem] leading-tight font-semibold tracking-[-0.03em] text-brand-950 sm:text-4xl">Reset your password</h1>
      <p className="mt-2 leading-7 text-muted-foreground">
        Enter the email you signed up with and we will send a reset link.
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
                  className="h-11 rounded-xl"
                  id="email"
                  placeholder="you@example.com"
                  type="email"
                />
                {fieldState.invalid ? (
                  <FieldError errors={[fieldState.error]} />
                ) : null}
              </Field>
            )}
          />
        </FieldGroup>
        {captcha.widget}
        {captcha.failed && !message ? (
          <div className="rounded-xl bg-warning-surface p-3 text-sm text-warning" role="alert">
            {CAPTCHA_LOAD_ERROR}
          </div>
        ) : null}
        {message ? (
          <div
            className={
              success
                ? "flex gap-2 rounded-xl bg-success-surface p-3 text-sm text-success"
                : "rounded-xl bg-warning-surface p-3 text-sm text-warning"
            }
            role="status"
          >
            {success ? <CheckCircle2 className="size-4 shrink-0" /> : null}
            {message}
          </div>
        ) : null}
        <Button
          className="h-12 w-full rounded-xl text-base active:scale-[0.99]"
          disabled={pending || !captcha.ready}
          size="lg"
          type="submit"
        >
          {pending || !captcha.ready ? <Spinner /> : null}
          {pending
            ? "Sending..."
            : captcha.ready
              ? "Send reset link"
              : captcha.pendingLabel}
        </Button>
      </form>
      <p className="mt-7 text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link
          className="font-medium text-teal-700 underline-offset-4 hover:underline"
          href="/login"
        >
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
