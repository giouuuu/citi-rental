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
import {
  CAPTCHA_LOAD_ERROR,
  useAuthCaptcha,
} from "@/features/auth/components/use-auth-captcha";
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
import { Progress } from "@/components/ui/progress";
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
    placeholder: "Juan dela Cruz",
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
  email: "",
  password: "",
  confirmPassword: "",
};

export function RegisterForm() {
  const router = useRouter();
  const [result, setResult] = useState<RegisterActionResult>();
  const [pending, startTransition] = useTransition();
  const captcha = useAuthCaptcha();

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: emptyValues,
  });

  function onSubmit(values: RegisterFormValues) {
    if (!captcha.ready) return;
    setResult(undefined);
    const formData = valuesToFormData(values, { captchaToken: captcha.token ?? "" });
    startTransition(async () => {
      const nextResult = await registerAction(formData);
      captcha.reset();
      setResult(nextResult);
      if (!nextResult.success && nextResult.fieldErrors) {
        applyServerFieldErrors(form.setError, nextResult.fieldErrors);
      }
      if (nextResult.success && nextResult.data?.status === "signed_in") {
        router.replace(nextResult.data.redirectTo ?? "/");
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
        <Progress
          aria-label="Creating account"
          className="fixed inset-x-0 top-0 z-50 h-1 rounded-none bg-primary/20"
        />
      ) : null}
      <h1 className="font-display text-[2rem] leading-tight font-semibold tracking-[-0.03em] text-brand-950 sm:text-4xl">
        Create your account
      </h1>
      <p className="mt-2 leading-7 text-muted-foreground">
        Renting a car? Continue with Google. Setting up your rental team?
        Create a workspace with email.
      </p>

      <div className="mt-8 space-y-5">
        <GoogleSignInButton label="Continue with Google" nextPath="/" />
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          or set up a workspace with email
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
                    className="h-11 rounded-xl"
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
        {captcha.widget}
        {(result && !result.success) || captcha.failed ? (
          <Alert className="rounded-xl" variant="destructive">
            <Info />
            <AlertDescription>
              {result && !result.success ? result.message : CAPTCHA_LOAD_ERROR}
            </AlertDescription>
          </Alert>
        ) : null}
        <Button
          className="h-12 w-full rounded-xl text-base active:scale-[0.99]"
          disabled={pending || !captcha.ready}
          size="lg"
          type="submit"
        >
          {pending || !captcha.ready ? <Spinner /> : <Building2 />}
          {pending
            ? "Creating workspace..."
            : captcha.ready
              ? "Create workspace"
              : captcha.pendingLabel}
        </Button>
      </form>
      <p className="mt-7 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          className="font-medium text-teal-700 underline-offset-4 hover:underline"
          href="/login"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
