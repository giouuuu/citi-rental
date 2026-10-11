"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Info, KeyRound } from "lucide-react";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { PasswordInput } from "@/components/auth/password-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { setPasswordAction } from "@/features/auth/actions/set-password-action";
import { PasswordRequirementsChecklist } from "@/features/auth/components/password-requirements-checklist";
import {
  setPasswordSchema,
  type SetPasswordInput,
} from "@/features/auth/schemas/set-password-schema";
import {
  applyServerFieldErrors,
  valuesToFormData,
} from "@/features/shared/lib/form-utils";

/**
 * On /account: lets a customer who booked with an email code add a password.
 * Collapsed by default; signing in with a code needs nothing from here.
 */
export function SetPasswordForm({ email }: { email?: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string>();
  const form = useForm<SetPasswordInput>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });
  const password = form.watch("password") ?? "";

  function onSubmit(values: SetPasswordInput) {
    setMessage(undefined);
    startTransition(async () => {
      const result = await setPasswordAction(valuesToFormData(values));
      if (!result.success) {
        if (result.fieldErrors) {
          applyServerFieldErrors(form.setError, result.fieldErrors);
        } else {
          setMessage(result.message);
        }
        return;
      }
      toast.success("Password saved. You can sign in with it or with an email code.");
      form.reset();
      setOpen(false);
    });
  }

  return (
    <section
      aria-labelledby="account-password-heading"
      className="rounded-xl border border-border bg-card p-5 sm:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <KeyRound aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-teal-600" />
          <div>
            <h2
              className="font-semibold text-brand-950"
              id="account-password-heading"
            >
              Password
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              You can always sign in with a code we email you. Set a password
              if you would rather type one.
            </p>
          </div>
        </div>
        {open ? null : (
          <Button
            className="shrink-0 self-start"
            onClick={() => setOpen(true)}
            type="button"
            variant="outline"
          >
            Set a password
          </Button>
        )}
      </div>

      {open ? (
        <form
          className="mt-5 space-y-5"
          noValidate
          onSubmit={form.handleSubmit(onSubmit)}
        >
          {/* Lets password managers save the new password against the account. */}
          <input
            autoComplete="username"
            hidden
            readOnly
            type="email"
            value={email ?? ""}
          />
          <FieldGroup className="grid items-start gap-4 sm:grid-cols-2">
            {(["password", "confirmPassword"] as const).map((name) => (
              <Controller
                control={form.control}
                key={name}
                name={name}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={`account-${name}`}>
                      {name === "password" ? "New password" : "Confirm password"}
                    </FieldLabel>
                    <PasswordInput
                      {...field}
                      aria-describedby={
                        name === "password" ? "account-password-requirements" : undefined
                      }
                      aria-invalid={fieldState.invalid}
                      autoComplete="new-password"
                      className="h-11"
                      disabled={pending}
                      id={`account-${name}`}
                    />
                    {name === "password" ? (
                      <PasswordRequirementsChecklist
                        id="account-password-requirements"
                        password={password}
                      />
                    ) : null}
                    {fieldState.invalid ? (
                      <FieldError errors={[fieldState.error]} />
                    ) : null}
                  </Field>
                )}
              />
            ))}
          </FieldGroup>

          {message ? (
            <Alert variant="destructive">
              <Info />
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button disabled={pending} type="submit">
              {pending ? <Spinner /> : null}
              {pending ? "Saving..." : "Save password"}
            </Button>
            <Button
              disabled={pending}
              onClick={() => {
                setOpen(false);
                setMessage(undefined);
                form.reset();
              }}
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
