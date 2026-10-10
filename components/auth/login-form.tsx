"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { Controller, useForm } from "react-hook-form";

import { loginAction } from "@/app/(auth)/actions";
import { LoginFormFooter } from "@/components/auth/login-form-footer";
import { PasswordInput } from "@/components/auth/password-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { GoogleSignInButton } from "@/features/auth/components/google-sign-in-button";
import {
  CAPTCHA_LOAD_ERROR,
  useAuthCaptcha,
} from "@/features/auth/components/use-auth-captcha";
import {
  isBookingNextPath,
  sanitizeNextPath,
} from "@/features/auth/lib/post-auth-redirect";
import {
  loginSchema,
  type LoginInput,
} from "@/features/auth/schemas/login-schema";
import {
  applyServerFieldErrors,
  valuesToFormData,
} from "@/features/shared/lib/form-utils";

export function LoginForm({
  resetComplete = false,
  nextPath,
  embedded = false,
}: {
  resetComplete?: boolean;
  nextPath?: string;
  /** Compact layout for intercepting-route modals */
  embedded?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string>();
  const safeNext = sanitizeNextPath(nextPath);
  const isBookingReturn = isBookingNextPath(safeNext);
  const captcha = useAuthCaptcha();

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  function onSubmit(values: LoginInput) {
    if (!captcha.ready) return;
    setMessage(undefined);
    const formData = valuesToFormData(values, { captchaToken: captcha.token ?? "" });
    if (safeNext) formData.set("next", safeNext);

    startTransition(async () => {
      const result = await loginAction(formData);
      captcha.reset();
      if (result.errors) {
        applyServerFieldErrors(form.setError, result.errors);
      }
      if (result.message) setMessage(result.message);
    });
  }

  return (
    <div>
      {embedded ? null : (
        <>
          <h1 className="font-display text-[2rem] leading-tight font-semibold tracking-[-0.03em] text-brand-950 sm:text-4xl">
            Welcome back
          </h1>
          <p className="mt-2 leading-7 text-muted-foreground">
            {isBookingReturn
              ? "Sign in to finish your reservation. Your trip details are saved."
              : "Sign in to reserve a car and keep track of your bookings."}
          </p>
        </>
      )}

      {resetComplete ? (
        <Alert className="mt-6 rounded-xl border-success/20 bg-success-surface">
          <AlertDescription className="text-success">
            Your password was updated. You can now sign in.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className={embedded ? "space-y-5" : "mt-8 space-y-5"}>
        <GoogleSignInButton
          nextPath={isBookingReturn ? safeNext : "/"}
        />
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          or sign in with email
          <div className="h-px flex-1 bg-border" />
        </div>
      </div>

      <form
        className="mt-5 space-y-5"
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
          <Controller
            control={form.control}
            name="password"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <div className="flex items-center justify-between gap-4">
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Link
                    className="text-xs font-medium text-teal-700 underline-offset-4 hover:underline"
                    href="/forgot-password"
                  >
                    Forgot password?
                  </Link>
                </div>
                <PasswordInput
                  {...field}
                  aria-invalid={fieldState.invalid}
                  autoComplete="current-password"
                  className="h-11 rounded-xl"
                  id="password"
                />
                {fieldState.invalid ? (
                  <FieldError errors={[fieldState.error]} />
                ) : null}
              </Field>
            )}
          />
        </FieldGroup>
        {captcha.widget}
        {message || captcha.failed ? (
          <div
            className="flex gap-2 rounded-xl border border-warning/20 bg-warning-surface p-3 text-sm leading-5 text-warning"
            role="alert"
          >
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>{message ?? CAPTCHA_LOAD_ERROR}</span>
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
            ? "Signing in..."
            : captcha.ready
              ? "Sign in"
              : captcha.pendingLabel}
        </Button>
      </form>

      <LoginFormFooter
        embedded={embedded}
        isBookingReturn={isBookingReturn}
      />
    </div>
  );
}
