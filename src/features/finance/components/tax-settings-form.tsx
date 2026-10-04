"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, RefreshCw, Save, TriangleAlert } from "lucide-react";
import { Controller, useForm, type Control } from "react-hook-form";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  restampPaymentVatAction,
  saveTaxSettingsAction,
} from "@/features/finance/actions/tax-settings-actions";
import {
  taxSettingsSchema,
  type TaxSettingsInput,
  type TaxSettingsValues,
} from "@/features/finance/schemas/tax-settings-schema";
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";
import { applyServerFieldErrors, valuesToFormData } from "@/features/shared/lib/form-utils";
import type { ActionResult } from "@/features/shared/types/resource";

type Name = keyof TaxSettingsInput;
type Option = { value: string; label: string };

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
].map((label, index) => ({ value: String(index + 1), label }));

function TextField({
  control,
  name,
  label,
  description,
  type = "text",
  step,
  placeholder,
  disabled,
  className,
  multiline,
}: {
  control: Control<TaxSettingsInput, unknown, TaxSettingsValues>;
  name: Name;
  label: string;
  description?: string;
  type?: "text" | "number";
  step?: string;
  placeholder?: string;
  disabled: boolean;
  className?: string;
  multiline?: boolean;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field className={className} data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={`tax-${name}`}>{label}</FieldLabel>
          {multiline ? (
            <Textarea
              aria-invalid={fieldState.invalid}
              disabled={disabled}
              id={`tax-${name}`}
              name={field.name}
              onBlur={field.onBlur}
              onChange={field.onChange}
              ref={field.ref}
              rows={3}
              value={String(field.value ?? "")}
            />
          ) : (
            <Input
              aria-invalid={fieldState.invalid}
              disabled={disabled}
              id={`tax-${name}`}
              name={field.name}
              onBlur={field.onBlur}
              onChange={(event) =>
                field.onChange(
                  type === "number" && event.target.value !== ""
                    ? event.target.valueAsNumber
                    : event.target.value,
                )
              }
              placeholder={placeholder}
              ref={field.ref}
              step={step}
              type={type}
              value={field.value === undefined || field.value === null ? "" : String(field.value)}
            />
          )}
          {description ? <FieldDescription>{description}</FieldDescription> : null}
          {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
        </Field>
      )}
    />
  );
}

function SelectField({
  control,
  name,
  label,
  options,
  description,
  disabled,
}: {
  control: Control<TaxSettingsInput, unknown, TaxSettingsValues>;
  name: Name;
  label: string;
  options: Option[];
  description?: string;
  disabled: boolean;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={`tax-${name}`}>{label}</FieldLabel>
          <Combobox
            aria-invalid={fieldState.invalid}
            disabled={disabled}
            id={`tax-${name}`}
            onValueChange={(value) =>
              field.onChange(name === "fiscal_year_start_month" ? Number(value) : value)
            }
            options={options}
            value={String(field.value ?? "")}
          />
          {description ? <FieldDescription>{description}</FieldDescription> : null}
          {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
        </Field>
      )}
    />
  );
}

export function TaxSettingsForm({ defaults }: { defaults: TaxSettingsInput }) {
  const [state, setState] = useState<ActionResult | null>(null);
  const { isPending, runMutation } = useMutationCoordinator();
  const router = useRouter();
  const form = useForm<TaxSettingsInput, unknown, TaxSettingsValues>({
    resolver: zodResolver(taxSettingsSchema),
    defaultValues: defaults,
  });
  const control = form.control;

  function onSubmit(values: TaxSettingsValues) {
    runMutation(async () => {
      const result = await saveTaxSettingsAction(valuesToFormData(values));
      setState(result);
      if (!result.success && result.fieldErrors) applyServerFieldErrors(form.setError, result.fieldErrors);
      if (result.success) {
        toast.success("Tax settings saved.");
        router.refresh();
      }
    });
  }

  return (
    <form className="space-y-6" noValidate onSubmit={form.handleSubmit(onSubmit)}>
      {state && !state.success ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Unable to save</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Registration</CardTitle>
          <CardDescription>As shown on the Certificate of Registration (BIR Form 2303).</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid items-start gap-5 md:grid-cols-2">
            <TextField control={control} disabled={isPending} label="Registered name" name="registered_name" />
            <TextField
              control={control}
              disabled={isPending}
              label="TIN"
              name="tin"
              placeholder="000-000-000-00000"
            />
            <TextField control={control} disabled={isPending} label="RDO code" name="rdo_code" placeholder="081" />
            <SelectField
              control={control}
              disabled={isPending}
              label="Taxpayer type"
              name="entity_type"
              options={[
                { value: "sole_proprietor", label: "Sole proprietor (DTI)" },
                { value: "partnership", label: "Partnership" },
                { value: "corporation", label: "Corporation (SEC)" },
              ]}
              description="Decides 1701 vs 1702 and whether the 8% option exists."
            />
            <TextField
              className="md:col-span-2"
              control={control}
              disabled={isPending}
              label="Registered address"
              multiline
              name="registered_address"
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tax types</CardTitle>
          <CardDescription>
            These choose which returns the worksheet prepares. Payments are stamped with the VAT treatment in force
            when they are recorded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid items-start gap-5 md:grid-cols-2">
            <SelectField
              control={control}
              disabled={isPending}
              label="VAT-registered"
              name="vat_registered"
              options={[
                { value: "no", label: "No — percentage tax (2551Q)" },
                { value: "yes", label: "Yes — VAT (2550Q)" },
              ]}
            />
            <SelectField
              control={control}
              disabled={isPending}
              label="Income tax election"
              name="income_tax_election"
              options={[
                { value: "undecided", label: "Not decided — compare all" },
                { value: "eight_percent", label: "8% on gross receipts" },
                { value: "graduated_osd", label: "Graduated rates + OSD" },
                { value: "graduated_itemized", label: "Graduated rates + itemized deductions" },
              ]}
              description="Made on the first quarterly return of the year. The worksheet compares every option anyway."
            />
            <SelectField
              control={control}
              disabled={isPending}
              label="Fiscal year starts"
              name="fiscal_year_start_month"
              options={MONTHS}
              description="Sole proprietors use the calendar year (January)."
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rates and thresholds</CardTitle>
          <CardDescription>
            Stored here, not in code, because they change. Confirm each with your accountant against current BIR
            issuances.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid items-start gap-5 md:grid-cols-3">
            <TextField control={control} disabled={isPending} label="VAT rate (%)" name="vat_rate" step="0.01" type="number" />
            <TextField
              control={control}
              disabled={isPending}
              label="Percentage tax rate (%)"
              name="percentage_tax_rate"
              step="0.01"
              type="number"
            />
            <TextField
              control={control}
              disabled={isPending}
              label="VAT threshold (PHP / year)"
              name="vat_threshold"
              step="0.01"
              type="number"
            />
            <TextField
              control={control}
              disabled={isPending}
              label="8% option rate (%)"
              name="eight_percent_rate"
              step="0.01"
              type="number"
            />
            <TextField
              control={control}
              disabled={isPending}
              label="8% option exemption (PHP)"
              name="eight_percent_exemption"
              step="0.01"
              type="number"
            />
            <TextField control={control} disabled={isPending} label="OSD rate (%)" name="osd_rate" step="0.01" type="number" />
            <TextField
              control={control}
              disabled={isPending}
              label="Corporate income tax rate (%)"
              name="corporate_income_tax_rate"
              step="0.01"
              type="number"
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button disabled={isPending} type="submit">
          {isPending ? <LoaderCircle className="animate-spin" /> : <Save />}
          {isPending ? "Saving…" : "Save tax settings"}
        </Button>
      </div>
    </form>
  );
}

/** Re-applies the current VAT settings to payments from a date on. */
export function RestampVatForm({ vatRegistered }: { vatRegistered: boolean }) {
  const [from, setFrom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { isPending, runMutation } = useMutationCoordinator();
  const router = useRouter();

  function submit() {
    const formData = new FormData();
    formData.set("from", from);
    runMutation(async () => {
      const result = await restampPaymentVatAction(formData);
      setError(result.success ? null : result.message);
      if (result.success) {
        toast.success(`${result.data?.count ?? 0} payments re-stamped as ${vatRegistered ? "VATable" : "non-VAT"}.`);
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Re-apply VAT treatment to past payments</CardTitle>
        <CardDescription>
          Each payment keeps the VAT treatment in force when it was recorded. After changing VAT registration, re-stamp
          payments from the date it took effect. Payments now: {vatRegistered ? "VATable at the rate above" : "non-VAT"}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-start gap-3">
          <Field className="w-56" data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="restamp-from">Effective from</FieldLabel>
            <DatePicker
              aria-invalid={Boolean(error)}
              disabled={isPending}
              id="restamp-from"
              onValueChange={setFrom}
              value={from}
            />
            {error ? <FieldError>{error}</FieldError> : null}
          </Field>
          <div className="grid gap-1.5">
            {/* Label-height spacer keeps the button aligned with the input. */}
            <FieldLabel aria-hidden="true" className="invisible">
              Apply
            </FieldLabel>
            <Button disabled={isPending || !from} onClick={submit} type="button" variant="outline">
              {isPending ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
              Re-stamp payments
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
