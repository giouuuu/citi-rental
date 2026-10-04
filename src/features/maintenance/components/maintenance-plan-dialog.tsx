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
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveMaintenancePlanAction } from "@/features/maintenance/actions/maintenance-actions";
import {
  describeInterval,
  formatKm,
  MAINTENANCE_PRESETS,
  type MaintenancePlan,
} from "@/features/maintenance/lib/maintenance-schedule";
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";

/**
 * Sets up or edits one recurring service. "Last done" is the starting point:
 * the next due date and km are counted from it until a service is recorded.
 */
export function MaintenancePlanDialog({
  open,
  onOpenChange,
  vehicleId,
  plan,
  existingNames,
  currentOdometer,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  /** The plan being edited; null for a new one. */
  plan: MaintenancePlan | null;
  /** Active plan names on this car, so presets already set up are hidden. */
  existingNames: string[];
  currentOdometer: number | null;
  today: string;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {open ? (
          <PlanForm
            currentOdometer={currentOdometer}
            existingNames={existingNames}
            onDone={() => onOpenChange(false)}
            plan={plan}
            today={today}
            vehicleId={vehicleId}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

const text = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value));

function PlanForm({
  vehicleId,
  plan,
  existingNames,
  currentOdometer,
  today,
  onDone,
}: {
  vehicleId: string;
  plan: MaintenancePlan | null;
  existingNames: string[];
  currentOdometer: number | null;
  today: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const { isPending, runMutation } = useMutationCoordinator();
  const [name, setName] = useState(plan?.name ?? "");
  const [intervalKm, setIntervalKm] = useState(text(plan?.intervalKm));
  const [intervalMonths, setIntervalMonths] = useState(text(plan?.intervalMonths));
  // Blank for a new plan: prefilling "today" would claim the work was just done
  // and hide a service that is already due.
  const [baselineDoneOn, setBaselineDoneOn] = useState(plan?.baselineDoneOn ?? "");
  const [baselineOdometer, setBaselineOdometer] = useState(text(plan?.baselineOdometer));
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const taken = new Set(existingNames.map((value) => value.trim().toLowerCase()));
  const presets = plan ? [] : MAINTENANCE_PRESETS.filter((preset) => !taken.has(preset.name.toLowerCase()));

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    runMutation(async () => {
      const result = await saveMaintenancePlanAction({
        id: plan?.id,
        vehicleId,
        name,
        intervalKm,
        intervalMonths,
        baselineDoneOn,
        baselineOdometer,
        notes: String(data.get("notes") ?? ""),
      });
      if (!result.success) {
        setError(result.message);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      toast.success(plan ? `${name} updated.` : `${name} added to the schedule.`);
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
        <DialogTitle>{plan ? `Edit ${plan.name}` : "Add maintenance plan"}</DialogTitle>
        <DialogDescription>
          Set km, months, or both. It falls due at whichever comes first, and you&apos;ll get a warning as it gets
          close.
        </DialogDescription>
      </DialogHeader>

      {presets.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <Button
              key={preset.name}
              onClick={() => {
                setName(preset.name);
                setIntervalKm(text(preset.intervalKm));
                setIntervalMonths(text(preset.intervalMonths));
              }}
              size="sm"
              type="button"
              variant={name === preset.name ? "secondary" : "outline"}
            >
              {preset.name} · {describeInterval(preset).replace(/^Every /, "")}
            </Button>
          ))}
        </div>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Unable to save</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup className="grid items-start gap-4 sm:grid-cols-2">
        <Field className="sm:col-span-2" data-invalid={invalid("name")}>
          <FieldLabel htmlFor="plan-name">Service</FieldLabel>
          <Input
            id="plan-name"
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            placeholder="Oil change"
            required
            value={name}
          />
          {fieldError("name")}
        </Field>
        <Field data-invalid={invalid("intervalKm")}>
          <FieldLabel htmlFor="plan-km">Every (km)</FieldLabel>
          <Input
            id="plan-km"
            inputMode="numeric"
            min={100}
            onChange={(event) => setIntervalKm(event.target.value)}
            placeholder="10000"
            step={1}
            type="number"
            value={intervalKm}
          />
          {fieldError("intervalKm")}
        </Field>
        <Field data-invalid={invalid("intervalMonths")}>
          <FieldLabel htmlFor="plan-months">Every (months)</FieldLabel>
          <Input
            id="plan-months"
            inputMode="numeric"
            min={1}
            onChange={(event) => setIntervalMonths(event.target.value)}
            placeholder="6"
            step={1}
            type="number"
            value={intervalMonths}
          />
          {fieldError("intervalMonths")}
        </Field>
        <Field data-invalid={invalid("baselineDoneOn")}>
          <FieldLabel htmlFor="plan-done-on">Last done on</FieldLabel>
          <DatePicker
            aria-invalid={invalid("baselineDoneOn")}
            id="plan-done-on"
            max={today}
            onValueChange={setBaselineDoneOn}
            required
            value={baselineDoneOn}
          />
          {fieldError("baselineDoneOn")}
        </Field>
        <Field data-invalid={invalid("baselineOdometer")}>
          <FieldLabel htmlFor="plan-odometer">Odometer then (km)</FieldLabel>
          <Input
            id="plan-odometer"
            inputMode="decimal"
            min={0}
            onChange={(event) => setBaselineOdometer(event.target.value)}
            step="0.1"
            type="number"
            value={baselineOdometer}
          />
          {fieldError("baselineOdometer") ?? (
            <FieldDescription>
              Needed when the plan counts km.
              {currentOdometer !== null ? ` The car reads ${formatKm(currentOdometer)} now.` : ""}
            </FieldDescription>
          )}
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="plan-notes">Notes</FieldLabel>
          <Textarea
            defaultValue={plan?.notes ?? ""}
            id="plan-notes"
            maxLength={2000}
            name="notes"
            placeholder="Fully synthetic 5W-30, Petron Banilad."
            rows={2}
          />
        </Field>
      </FieldGroup>

      <DialogFooter>
        <Button disabled={isPending} type="submit">
          {isPending ? <LoaderCircle className="animate-spin" /> : <Save />}
          {isPending ? "Saving…" : plan ? "Save plan" : "Add plan"}
        </Button>
      </DialogFooter>
    </form>
  );
}
