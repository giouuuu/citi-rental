"use client";

import { useActionState } from "react";

import { resetPasswordAction, type AuthActionState } from "@/app/(auth)/actions";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

const initialState: AuthActionState = {};

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialState);

  return (
    <div>
      <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">Choose a new password</p>
      <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em]">Secure your account</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Use at least 8 characters. Avoid passwords used on other services.
      </p>
      <form action={formAction} className="mt-8 space-y-5" noValidate>
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <PasswordInput
            aria-invalid={Boolean(state.errors?.password)}
            autoComplete="new-password"
            id="password"
            name="password"
            required
          />
          {state.errors?.password ? (
            <p className="text-xs text-destructive" role="alert">{state.errors.password[0]}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Minimum 8 characters.</p>
          )}
        </div>
        {state.message ? (
          <p className="rounded-md bg-danger-surface p-3 text-sm text-destructive" role="alert">{state.message}</p>
        ) : null}
        <Button className="w-full" disabled={pending} size="lg" type="submit">
          {pending ? <Spinner /> : null}
          {pending ? "Updating..." : "Update password"}
        </Button>
      </form>
    </div>
  );
}
