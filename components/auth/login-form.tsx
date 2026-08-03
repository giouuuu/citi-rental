"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { Controller, useForm } from "react-hook-form";

import { loginAction } from "@/app/(auth)/actions";
import { LoginFormFooter } from "@/components/auth/login-form-footer";
import { PasswordInput } from "@/components/auth/password-input";
import { ZekeMark } from "@/components/brand/zeke-mark";
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

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  function onSubmit(values: LoginInput) {
    setMessage(undefined);
    const formData = valuesToFormData(values);
    if (safeNext) formData.set("next", safeNext);

    startTransition(async () => {
      const result = await loginAction(formData);
      if (result.errors) {
        applyServerFieldErrors(form.setError, result.errors);
      }
      if (result.message) setMessage(result.message);
    });
  }

  return (
    <div>
      {embedded ? null : (
        <div className="mb-8 lg:hidden">
          {isBookingReturn ? (
            <ZekeMark className="size-10" variant="navy" />
          ) : (
            <span className="flex size-10 items-center justify-center rounded-md bg-brand-900 text-sm font-black text-white">
              M
            </span>
          )}
        </div>
      )}
      {embedded ? null : (
        <>
          <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
            {isBookingReturn ? "Customer access" : "Secure staff access"}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em]">Welcome back</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {isBookingReturn
              ? "Sign in to continue your reservation with saved account details."
              : "Sign in to manage rentals and monitor fleet activity."}
          </p>
        </>
      )}

      {resetComplete ? (
        <Alert className="mt-6 border-success/20 bg-success-surface">
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
          or continue with email
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
          <Controller
            control={form.control}
            name="password"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <div className="flex items-center justify-between gap-4">
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Link
                    className="text-xs font-medium text-primary hover:underline"
                    href="/forgot-password"
                  >
                    Forgot password?
                  </Link>
                </div>
                <PasswordInput
                  {...field}
                  aria-invalid={fieldState.invalid}
                  autoComplete="current-password"
                  id="password"
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
            className="flex gap-2 rounded-md border border-warning/20 bg-warning-surface p-3 text-sm leading-5 text-warning"
            role="alert"
          >
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>{message}</span>
          </div>
        ) : null}
        <Button className="w-full" disabled={pending} size="lg" type="submit">
          {pending ? <Spinner /> : null}
          {pending ? "Signing in..." : "Sign in"}
        </Button>
      </form>

      <LoginFormFooter
        embedded={embedded}
        isBookingReturn={isBookingReturn}
        safeNext={safeNext}
      />
    </div>
  );
}
