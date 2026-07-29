"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, Info } from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";

import {
  registerAction,
  type RegisterActionResult,
} from "@/features/auth/actions/register-action";
import { GoogleSignInButton } from "@/features/auth/components/google-sign-in-button";
import { RegisterPasswordFields } from "@/features/auth/components/register-password-fields";
import { RegisterVerificationNotice } from "@/features/auth/components/register-verification-notice";
import { registerSchema } from "@/features/auth/schemas/register-schema";
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
import {
  applyServerFieldErrors,
  valuesToFormData,
} from "@/features/shared/lib/form-utils";

type RegisterFormValues = z.infer<typeof registerSchema>;

const fields = [
  {
    name: "fullName" as const,
    label: "Full name",
    autoComplete: "name",
    placeholder: "Alex Rivera",
    type: "text",
  },
  {
    name: "organizationName" as const,
    label: "Organization name",
    autoComplete: "organization",
    placeholder: "Northline Rentals",
    type: "text",
  },
  {
    name: "email" as const,
    label: "Work email",
    autoComplete: "email",
    placeholder: "you@company.com",
    type: "email",
  },
];

const emptyValues: RegisterFormValues = {
  fullName: "",
  organizationName: "",
  email: "",
  password: "",
  confirmPassword: "",
};

export function RegisterForm() {
  const router = useRouter();
  const [result, setResult] = useState<RegisterActionResult>();
  const [pending, startTransition] = useTransition();

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: emptyValues,
  });

  function onSubmit(values: RegisterFormValues) {
    setResult(undefined);
    startTransition(async () => {
      const nextResult = await registerAction(valuesToFormData(values));
      setResult(nextResult);
      if (!nextResult.success && nextResult.fieldErrors) {
        applyServerFieldErrors(form.setError, nextResult.fieldErrors);
      }
      if (nextResult.success && nextResult.data?.status === "signed_in") {
        router.replace("/dashboard");
        router.refresh();
      }
    });
  }

  if (result?.success && result.data?.status === "verification_required") {
    return (
      <RegisterVerificationNotice
        message={result.data.message}
        onUseDifferentEmail={() => {
          setResult(undefined);
          form.reset(emptyValues);
        }}
      />
    );
  }

  return (
    <div aria-busy={pending}>
      {pending ? (
        <div
          aria-label="Creating account"
          className="fixed inset-x-0 top-0 z-50 h-1 overflow-hidden bg-primary/20"
          role="progressbar"
        >
          <div className="h-full w-1/2 animate-pulse bg-primary motion-reduce:animate-none" />
        </div>
      ) : null}
      <div className="mb-8 lg:hidden">
        <span className="flex size-10 items-center justify-center rounded-md bg-brand-900 text-sm font-black text-white">
          M
        </span>
      </div>
      <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
        Create your workspace
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em]">
        Start managing your fleet
      </h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Set up your rental organization and developer admin account. Or continue
        with Google for a customer booking account.
      </p>

      <div className="mt-8 space-y-5">
        <GoogleSignInButton label="Continue with Google" nextPath="/" />
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          or create a workspace with email
          <div className="h-px flex-1 bg-border" />
        </div>
      </div>

      <form
        className="mt-5 space-y-5"
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <FieldGroup>
          {fields.map((item) => (
            <Controller
              control={form.control}
              key={item.name}
              name={item.name}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={item.name}>{item.label}</FieldLabel>
                  <Input
                    {...field}
                    aria-invalid={fieldState.invalid}
                    autoComplete={item.autoComplete}
                    className="h-11"
                    disabled={pending}
                    id={item.name}
                    placeholder={item.placeholder}
                    type={item.type}
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : null}
                </Field>
              )}
            />
          ))}
          <RegisterPasswordFields control={form.control} pending={pending} />
        </FieldGroup>
        {result && !result.success ? (
          <Alert variant="destructive">
            <Info />
            <AlertDescription>{result.message}</AlertDescription>
          </Alert>
        ) : null}
        <Button className="w-full" disabled={pending} size="lg" type="submit">
          {pending ? <Spinner /> : <Building2 />}
          {pending ? "Creating workspace..." : "Create account"}
        </Button>
      </form>
      <p className="mt-7 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link className="font-medium text-primary hover:underline" href="/login">
          Sign in
        </Link>
      </p>
    </div>
  );
}
