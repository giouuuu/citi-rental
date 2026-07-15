"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, Info } from "lucide-react";

import { loginAction, type AuthActionState } from "@/app/(auth)/actions";
import { PasswordInput } from "@/components/auth/password-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

const initialState: AuthActionState = {};

export function LoginForm({ resetComplete = false }: { resetComplete?: boolean }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <div>
      <div className="mb-8 lg:hidden">
        <span className="flex size-10 items-center justify-center rounded-md bg-brand-900 text-sm font-black text-white">
          M
        </span>
      </div>
      <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
        Secure staff access
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em]">Welcome back</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Sign in to manage rentals and monitor fleet activity.
      </p>

      {resetComplete ? (
        <Alert className="mt-6 border-success/20 bg-success-surface">
          <AlertDescription className="text-success">
            Your password was updated. You can now sign in.
          </AlertDescription>
        </Alert>
      ) : null}

      <form action={formAction} className="mt-8 space-y-5" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <Input
            aria-describedby={state.errors?.email ? "email-error" : undefined}
            aria-invalid={Boolean(state.errors?.email)}
            autoComplete="email"
            id="email"
            name="email"
            placeholder="you@company.com"
            required
            type="email"
          />
          {state.errors?.email ? (
            <p className="text-xs text-destructive" id="email-error" role="alert">
              {state.errors.email[0]}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="password">Password</Label>
            <Link className="text-xs font-medium text-primary hover:underline" href="/forgot-password">
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            aria-describedby={state.errors?.password ? "password-error" : undefined}
            aria-invalid={Boolean(state.errors?.password)}
            autoComplete="current-password"
            id="password"
            name="password"
            required
          />
          {state.errors?.password ? (
            <p className="text-xs text-destructive" id="password-error" role="alert">
              {state.errors.password[0]}
            </p>
          ) : null}
        </div>
        {state.message ? (
          <div className="flex gap-2 rounded-md border border-warning/20 bg-warning-surface p-3 text-sm leading-5 text-warning" role="alert">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>{state.message}</span>
          </div>
        ) : null}
        <Button className="w-full" disabled={pending} size="lg" type="submit">
          {pending ? <Spinner /> : null}
          {pending ? "Signing in..." : "Sign in"}
        </Button>
      </form>
      <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        Local review
        <div className="h-px flex-1 bg-border" />
      </div>
      <Button asChild className="w-full" variant="outline">
        <Link href="/dashboard">
          Open demo workspace <ArrowRight />
        </Link>
      </Button>
      <p className="mt-7 text-center text-sm text-muted-foreground">
        New to City Rentals?{" "}
        <Link className="font-medium text-primary hover:underline" href="/register">
          Create an account
        </Link>
      </p>
      <p className="mt-8 text-center text-xs leading-5 text-muted-foreground">
        Access is limited to authorized rental operations staff.
      </p>
    </div>
  );
}
