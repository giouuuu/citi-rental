"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";

import {
  registerAction,
  type RegisterActionResult,
} from "@/features/auth/actions/register-action";
import { GoogleSignInButton } from "@/features/auth/components/google-sign-in-button";
import {
  isBookingNextPath,
  sanitizeNextPath,
} from "@/features/auth/lib/post-auth-redirect";
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
    label: "Email address",
    autoComplete: "email",
    placeholder: "you@example.com",
    type: "email",
  },
];

const emptyValues: RegisterFormValues = {
  fullName: "",
  email: "",
  password: "",
  confirmPassword: "",
};

export function RegisterForm({ nextPath }: { nextPath?: string }) {
  const router = useRouter();
  const safeNext = sanitizeNextPath(nextPath);
  /** A guest signing up from the booking form, whose draft waits there. */
  const bookingNext = isBookingNextPath(safeNext) ? safeNext : undefined;
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
    if (bookingNext) formData.set("next", bookingNext);
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
        {bookingNext
          ? "Then you go straight back to your booking, with everything you entered."
          : "Book a car in a few minutes and keep track of your reservations."}
      </p>

      <div className="mt-8 space-y-5">
        <GoogleSignInButton
          label="Continue with Google"
          nextPath={bookingNext ?? "/"}
        />
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          or sign up with email
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
          {pending || !captcha.ready ? <Spinner /> : null}
          {pending
            ? "Creating account..."
            : captcha.ready
              ? "Create account"
              : captcha.pendingLabel}
        </Button>
      </form>
      <p className="mt-7 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          className="font-medium text-teal-700 underline-offset-4 hover:underline"
          href={
            bookingNext
              ? `/login?next=${encodeURIComponent(bookingNext)}`
              : "/login"
          }
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
