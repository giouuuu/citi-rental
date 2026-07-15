"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

import { forgotPasswordAction, type AuthActionState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

const initialState: AuthActionState = {};

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    forgotPasswordAction,
    initialState,
  );

  return (
    <div>
      <Button asChild className="-ml-3 mb-6" variant="ghost">
        <Link href="/login"><ArrowLeft /> Back to sign in</Link>
      </Button>
      <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">Account recovery</p>
      <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em]">Reset your password</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Enter your staff email and we will send a secure reset link.
      </p>
      <form action={formAction} className="mt-8 space-y-5" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <Input
            aria-invalid={Boolean(state.errors?.email)}
            autoComplete="email"
            id="email"
            name="email"
            placeholder="you@company.com"
            required
            type="email"
          />
          {state.errors?.email ? (
            <p className="text-xs text-destructive" role="alert">{state.errors.email[0]}</p>
          ) : null}
        </div>
        {state.message ? (
          <div
            className={state.success ? "flex gap-2 rounded-md bg-success-surface p-3 text-sm text-success" : "rounded-md bg-warning-surface p-3 text-sm text-warning"}
            role="status"
          >
            {state.success ? <CheckCircle2 className="size-4 shrink-0" /> : null}
            {state.message}
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
