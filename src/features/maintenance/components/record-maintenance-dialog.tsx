"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, LoaderCircle, Save } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PAYMENT_METHODS } from "@/features/finance/schemas/expense-definition";
import { recordMaintenanceAction } from "@/features/maintenance/actions/maintenance-actions";
import { MAINTENANCE_CATEGORIES, MAINTENANCE_DOCUMENT_TYPES } from "@/features/maintenance/lib/maintenance-options";
import { formatKm, type MaintenancePlan } from "@/features/maintenance/lib/maintenance-schedule";
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";
import { formatPhpExact } from "@/features/shared/client";

/** Select value for work that is not on a schedule. */
const ONE_OFF = "one_off";

/**
 * Logs one service. Its cost is posted as this car's Repairs and maintenance
 * expense, and the next due date and km restart from it.
 */
export function RecordMaintenanceDialog({
  open,
  onOpenChange,
  vehicleId,
  vehicleLabel,
  plans,
  initialPlanId,
  currentOdometer,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  vehicleLabel: string;
  /** Active plans on this car. */
  plans: MaintenancePlan[];
  /** Preselects a plan; null opens on a one-off repair (or the only plan). */
  initialPlanId: string | null;
  currentOdometer: number | null;
  today: string;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        {open ? (
          <RecordForm
            currentOdometer={currentOdometer}
            initialPlanId={initialPlanId}
            onDone={() => onOpenChange(false)}
            plans={plans}
            today={today}
            vehicleId={vehicleId}
            vehicleLabel={vehicleLabel}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RecordForm({
  vehicleId,
  vehicleLabel,
  plans,
  initialPlanId,
  currentOdometer,
  today,
  onDone,
}: {
  vehicleId: string;
  vehicleLabel: string;
  plans: MaintenancePlan[];
  initialPlanId: string | null;
  currentOdometer: number | null;
  today: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const { isPending, runMutation } = useMutationCoordinator();
  const [planValue, setPlanValue] = useState(initialPlanId ?? ONE_OFF);
  const [cost, setCost] = useState("");
  const [category, setCategory] = useState<string>(MAINTENANCE_CATEGORIES[0].value);
  const [documentType, setDocumentType] = useState<string>("non_vat_invoice");
  const [method, setMethod] = useState("cash");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const plan = plans.find((entry) => entry.id === planValue) ?? null;
  const countsKm = Boolean(plan?.intervalKm);
  const amount = Number(cost) || 0;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    runMutation(async () => {
      const result = await recordMaintenanceAction({
        vehicleId,
        planId: plan?.id,
        title: plan ? undefined : String(data.get("title") ?? ""),
        performedOn: String(data.get("performedOn") ?? ""),
        odometer: String(data.get("odometer") ?? ""),
        cost,
        categoryCode: category as "repairs_labor" | "repairs_materials",
        shopName: String(data.get("shopName") ?? ""),
        documentType,
        documentNumber: String(data.get("documentNumber") ?? ""),
        inputVat: String(data.get("inputVat") ?? ""),
        paymentMethod: method,
        notes: String(data.get("notes") ?? ""),
      });
      if (!result.success) {
        setError(result.message);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      toast.success(
        amount > 0
          ? `${plan?.name ?? "Service"} recorded, and ${formatPhpExact(amount)} booked as this car's expense.`
          : `${plan?.name ?? "Service"} recorded.`,
      );
      onDone();
      router.refresh();
    });
  }

  const fieldError = (key: string) =>
    fieldErrors[key]?.length ? <FieldError>{fieldErrors[key][0]}</FieldError> : null;
  const invalid = (key: string) => Boolean(fieldErrors[key]) || undefined;

  return (
    <form className="grid gap-4" noValidate onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>Record service</DialogTitle>
        <DialogDescription>
          {vehicleLabel}. The cost is booked as this car&apos;s Repairs and maintenance expense, and the next due date
          counts from this service.
        </DialogDescription>
      </DialogHeader>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Unable to record</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup className="grid items-start gap-4 sm:grid-cols-2">
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="service-plan">Service</FieldLabel>
          <Combobox
            id="service-plan"
            onValueChange={setPlanValue}
            options={[
              ...plans.map((entry) => ({ value: entry.id, label: entry.name })),
              { value: ONE_OFF, label: "One-off repair (not on a schedule)" },
            ]}
            searchPlaceholder="Search services…"
            value={planValue}
          />
        </Field>
        {plan ? null : (
          <Field className="sm:col-span-2" data-invalid={invalid("title")}>
            <FieldLabel htmlFor="service-title">Work done</FieldLabel>
            <Input id="service-title" maxLength={160} name="title" placeholder="Replaced front tires" required />
            {fieldError("title")}
          </Field>
        )}
        <Field data-invalid={invalid("performedOn")}>
          <FieldLabel htmlFor="service-date">Done on</FieldLabel>
          <DatePicker
            aria-invalid={invalid("performedOn")}
            defaultValue={today}
            id="service-date"
            max={today}
            name="performedOn"
            required
          />
          {fieldError("performedOn")}
        </Field>
        <Field data-invalid={invalid("odometer")}>
          <FieldLabel htmlFor="service-odometer">Odometer (km)</FieldLabel>
          <Input
            defaultValue={currentOdometer ?? ""}
            id="service-odometer"
            inputMode="decimal"
            min={0}
            name="odometer"
            required={countsKm}
            step="0.1"
            type="number"
          />
          {fieldError("odometer") ??
            (countsKm ? (
              <FieldDescription>Required: the next {plan?.name.toLowerCase()} is counted from it.</FieldDescription>
            ) : currentOdometer !== null ? (
              <FieldDescription>Last known reading {formatKm(currentOdometer)}.</FieldDescription>
            ) : null)}
        </Field>
        <Field data-invalid={invalid("cost")}>
          <FieldLabel htmlFor="service-cost">Cost (PHP, VAT included)</FieldLabel>
          <Input
            id="service-cost"
            inputMode="decimal"
            min={0}
            onChange={(event) => setCost(event.target.value)}
            placeholder="0.00"
            required
            step="0.01"
            type="number"
            value={cost}
          />
          {fieldError("cost") ?? <FieldDescription>Enter 0 for free or warranty work.</FieldDescription>}
        </Field>
        <Field>
          <FieldLabel htmlFor="service-category">Expense line</FieldLabel>
          <Combobox id="service-category" onValueChange={setCategory} options={MAINTENANCE_CATEGORIES} value={category} />
          <FieldDescription>
            {MAINTENANCE_CATEGORIES.find((option) => option.value === category)?.hint}
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="service-shop">Shop</FieldLabel>
          <Input id="service-shop" maxLength={200} name="shopName" placeholder="Toyota Cebu" />
        </Field>
        <Field>
          <FieldLabel htmlFor="service-method">Paid by</FieldLabel>
          <Combobox id="service-method" onValueChange={setMethod} options={PAYMENT_METHODS} value={method} />
        </Field>
        <Field>
          <FieldLabel htmlFor="service-document-type">Receipt</FieldLabel>
          <Combobox id="service-document-type" onValueChange={setDocumentType} options={MAINTENANCE_DOCUMENT_TYPES} value={documentType} />
        </Field>
        <Field>
          <FieldLabel htmlFor="service-document-number">Receipt number</FieldLabel>
          <Input
            disabled={documentType === "none"}
            id="service-document-number"
            maxLength={80}
            name="documentNumber"
            placeholder="SI-000123"
          />
          {documentType !== "none" ? (
            <FieldDescription>Without one, the expense is flagged as missing its document.</FieldDescription>
          ) : null}
        </Field>
        {documentType === "vat_invoice" ? (
          <Field className="sm:col-span-2" data-invalid={invalid("inputVat")}>
            <FieldLabel htmlFor="service-vat">VAT on the invoice (PHP)</FieldLabel>
            <Input
              id="service-vat"
              inputMode="decimal"
              min={0}
              name="inputVat"
              placeholder={amount > 0 ? (Math.round((amount * 12) / 112 * 100) / 100).toFixed(2) : "0.00"}
              step="0.01"
              type="number"
            />
            {fieldError("inputVat") ?? (
              <FieldDescription>The VAT line printed on the invoice. Usually 12/112 of the total.</FieldDescription>
            )}
          </Field>
        ) : null}
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="service-notes">Notes</FieldLabel>
          <Textarea
            id="service-notes"
            maxLength={2000}
            name="notes"
            placeholder="Also replaced the cabin filter."
            rows={2}
          />
        </Field>
      </FieldGroup>

      <DialogFooter>
        <Button disabled={isPending} type="submit">
          {isPending ? <LoaderCircle className="animate-spin" /> : <Save />}
          {isPending ? "Saving…" : "Record service"}
        </Button>
      </DialogFooter>
    </form>
  );
}
