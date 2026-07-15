"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, Info } from "lucide-react";
import { useState, useTransition } from "react";

import {
  registerAction,
  type RegisterActionResult,
} from "@/features/auth/actions/register-action";
import { PasswordInput } from "@/components/auth/password-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

const fields = [
  {
    name: "fullName",
    label: "Full name",
    autoComplete: "name",
    placeholder: "Alex Rivera",
    type: "text",
  },
  {
    name: "organizationName",
    label: "Organization name",
    autoComplete: "organization",
    placeholder: "Northline Rentals",
    type: "text",
  },
  {
    name: "email",
    label: "Work email",
    autoComplete: "email",
    placeholder: "you@company.com",
    type: "email",
  },
] as const;

export function RegisterForm() {
  const router = useRouter();
  const [result, setResult] = useState<RegisterActionResult>();
  const [pending, startTransition] = useTransition();
  const errors = result && !result.success ? result.fieldErrors : undefined;

  function submit(formData: FormData) {
    setResult(undefined);
    startTransition(async () => {
      const nextResult = await registerAction(formData);
      setResult(nextResult);
      if (nextResult.success && nextResult.data?.status === "signed_in") {
        router.replace("/dashboard");
        router.refresh();
      }
    });
  }

  if (result?.success && result.data?.status === "verification_required") {
    return (
      <div className="space-y-6 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-surface text-success">
          <CheckCircle2 className="size-6" />
        </span>
        <div>
          <h1 className="text-3xl font-bold tracking-[-0.03em]">Confirm your email</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {result.data.message}
          </p>
        </div>
        <Button asChild className="w-full" size="lg">
          <Link href="/login">Return to sign in</Link>
        </Button>
        <button
          className="min-h-11 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setResult(undefined)}
          type="button"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div aria-busy={pending}>
      {pending ? (
        <div aria-label="Creating account" className="fixed inset-x-0 top-0 z-50 h-1 overflow-hidden bg-primary/20" role="progressbar">
          <div className="h-full w-1/2 animate-pulse bg-primary motion-reduce:animate-none" />
        </div>
      ) : null}
      <div className="mb-8 lg:hidden">
        <span className="flex size-10 items-center justify-center rounded-md bg-brand-900 text-sm font-black text-white">M</span>
      </div>
      <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">Create your workspace</p>
      <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em]">Start managing your fleet</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Set up your rental organization and administrator account.
      </p>

      <form action={submit} className="mt-8 space-y-5" noValidate>
        {fields.map((field) => (
          <div className="space-y-2" key={field.name}>
            <Label htmlFor={field.name}>{field.label}</Label>
            <Input
              aria-describedby={errors?.[field.name] ? `${field.name}-error` : undefined}
              aria-invalid={Boolean(errors?.[field.name])}
              autoComplete={field.autoComplete}
              className="h-11"
              disabled={pending}
              id={field.name}
              name={field.name}
              placeholder={field.placeholder}
              required
              type={field.type}
            />
            {errors?.[field.name] ? (
              <p className="text-xs text-destructive" id={`${field.name}-error`} role="alert">{errors[field.name]?.[0]}</p>
            ) : null}
          </div>
        ))}
        {(["password", "confirmPassword"] as const).map((name) => (
          <div className="space-y-2" key={name}>
            <Label htmlFor={name}>{name === "password" ? "Password" : "Confirm password"}</Label>
            <PasswordInput
              aria-describedby={
                errors?.[name]
                  ? `${name}-error`
                  : name === "password"
                    ? "password-help"
                    : undefined
              }
              aria-invalid={Boolean(errors?.[name])}
              autoComplete="new-password"
              className="h-11"
              disabled={pending}
              id={name}
              name={name}
              required
            />
            {name === "password" && !errors?.password ? (
              <p className="text-xs text-muted-foreground" id="password-help">Use 8–72 characters with at least one letter and number.</p>
            ) : null}
            {errors?.[name] ? (
              <p className="text-xs text-destructive" id={`${name}-error`} role="alert">{errors[name]?.[0]}</p>
            ) : null}
          </div>
        ))}
        {result && !result.success ? (
          <Alert variant="destructive"><Info /><AlertDescription>{result.message}</AlertDescription></Alert>
        ) : null}
        <Button className="w-full" disabled={pending} size="lg" type="submit">
          {pending ? <Spinner /> : <Building2 />}
          {pending ? "Creating workspace..." : "Create account"}
        </Button>
      </form>
      <p className="mt-7 text-center text-sm text-muted-foreground">
        Already have an account? <Link className="font-medium text-primary hover:underline" href="/login">Sign in</Link>
      </p>
    </div>
  );
}
