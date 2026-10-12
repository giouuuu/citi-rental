"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ReceiptText, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmActionDialog } from "@/features/shared/components/confirm-action-dialog";
import { ExportRowsButton } from "@/features/shared/components/export-rows-button";
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";
import { formatPhpExact } from "@/features/shared/client";
import {
  removeVehicleBookingChargeAction,
  saveVehicleBookingChargeAction,
} from "@/features/vehicles/actions/vehicle-booking-charge-actions";
import {
  type BookingChargeOption,
  DRIVING_MODE_LABELS,
  type VehicleBookingChargeRow,
} from "@/features/vehicles/lib/vehicle-booking-charges";

type DrivingMode = VehicleBookingChargeRow["drivingMode"];

const MODES: { mode: DrivingMode; empty: string }[] = [
  {
    mode: "self_drive",
    empty: "Self-drive bookings are the rate plus delivery. Add one, like a car wash.",
  },
  {
    mode: "with_driver",
    empty: "With-driver bookings are the rate plus the driver.",
  },
];

/**
 * Fleet → vehicle → Booking charges: what this car adds to every online
 * booking, side by side for self-drive and with a driver. Customers see each
 * one as its own line on the bill. Bookings already made keep their charges.
 */
export function VehicleBookingChargesPanel({
  vehicleId,
  vehicleLabel,
  charges,
  options,
}: {
  vehicleId: string;
  vehicleLabel: string;
  charges: VehicleBookingChargeRow[];
  options: BookingChargeOption[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Booking charges</CardTitle>
        <CardDescription>
          Added to every online booking of this car, for the way it is
          rented. Customers see each charge as its own line on their bill.
          Bookings already made keep their charges.
        </CardDescription>
        <CardAction>
          <ExportRowsButton
            fileName={`booking-charges-${vehicleLabel
              .toLowerCase()
              .replaceAll(/[^a-z0-9]+/g, "-")
              .replaceAll(/^-+|-+$/g, "")}`}
            sheets={[
              {
                name: "Booking charges",
                columns: [
                  { key: "mode", header: "Driving" },
                  { key: "name", header: "Charge" },
                  { key: "amount", header: "Amount", format: "money" },
                ],
                rows: charges.map((charge) => ({
                  mode: DRIVING_MODE_LABELS[charge.drivingMode],
                  name: charge.name,
                  amount: charge.amount,
                })),
              },
            ]}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="grid items-start gap-6 lg:grid-cols-2">
        {MODES.map(({ mode, empty }) => (
          <ModeCharges
            charges={charges.filter((charge) => charge.drivingMode === mode)}
            empty={empty}
            key={mode}
            mode={mode}
            options={options}
            vehicleId={vehicleId}
          />
        ))}
      </CardContent>
    </Card>
  );
}

/** One driving mode's charges, with its own add row. */
function ModeCharges({
  mode,
  empty,
  vehicleId,
  charges,
  options,
}: {
  mode: DrivingMode;
  empty: string;
  vehicleId: string;
  charges: VehicleBookingChargeRow[];
  options: BookingChargeOption[];
}) {
  const router = useRouter();
  const { runMutation } = useMutationCoordinator();
  const [chargeTypeId, setChargeTypeId] = useState("");
  const [amount, setAmount] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | undefined>();
  const [removeError, setRemoveError] = useState<string | undefined>();
  const label = DRIVING_MODE_LABELS[mode];
  const idPrefix = `booking-charge-${mode}`;

  function pickCharge(id: string) {
    setChargeTypeId(id);
    // The car's own amount in this mode, or the charge type's default, fills the field.
    const existing = charges.find((charge) => charge.chargeTypeId === id);
    const fallback = options.find((option) => option.id === id)?.defaultAmount;
    const filled = existing?.amount ?? fallback;
    if (filled != null) setAmount(String(filled));
  }

  function add() {
    runMutation(async () => {
      const result = await saveVehicleBookingChargeAction({
        vehicleId,
        chargeTypeId,
        drivingMode: mode,
        amount,
      });
      if (!result.success) {
        setFieldErrors(result.fieldErrors ?? {});
        setError(result.fieldErrors ? undefined : result.message);
        return;
      }
      setFieldErrors({});
      setError(undefined);
      setChargeTypeId("");
      setAmount("");
      toast.success(`Saved. New ${label.toLowerCase()} bookings of this car include it.`);
      router.refresh();
    });
  }

  function remove(id: string) {
    runMutation(async () => {
      const result = await removeVehicleBookingChargeAction(id);
      if (!result.success) {
        setRemoveError(result.message);
        return;
      }
      setRemoveError(undefined);
      toast.success("Booking charge removed. Bookings already made keep it.");
      router.refresh();
    });
  }

  const fieldError = (name: string) =>
    fieldErrors[name]?.length ? [{ message: fieldErrors[name][0] }] : undefined;

  return (
    <section aria-labelledby={`${idPrefix}-title`} className="space-y-3">
      <h3 className="text-sm font-semibold text-brand-950" id={`${idPrefix}-title`}>
        {label}
      </h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Charge</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">Remove</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {charges.length ? (
            charges.map((charge) => (
              <TableRow key={charge.id}>
                <TableCell className="font-medium">{charge.name}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPhpExact(charge.amount)}
                </TableCell>
                <TableCell>
                  <ConfirmActionDialog
                    cancelLabel="Keep it"
                    confirmLabel="Remove charge"
                    description={`New ${label.toLowerCase()} bookings of this car will no longer include ${charge.name}. Bookings already made keep it.`}
                    error={removeError}
                    onConfirm={() => remove(charge.id)}
                    title={`Remove ${charge.name}?`}
                    trigger={
                      <Button
                        aria-label={`Remove ${charge.name} from ${label.toLowerCase()}`}
                        size="icon"
                        variant="ghost"
                      >
                        <Trash2 />
                      </Button>
                    }
                    variant="destructive"
                  />
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={3}>
                <Empty className="border-0 py-4">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ReceiptText />
                    </EmptyMedia>
                    <EmptyTitle>No {label.toLowerCase()} charges</EmptyTitle>
                    <EmptyDescription>{empty}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto]">
        <Field data-invalid={Boolean(fieldErrors.chargeTypeId)}>
          <FieldLabel htmlFor={`${idPrefix}-type`}>Charge</FieldLabel>
          <Combobox
            emptyMessage="No active charge types. Add one in Settings → Charge types."
            id={`${idPrefix}-type`}
            onValueChange={pickCharge}
            options={options.map((option) => ({ value: option.id, label: option.name }))}
            placeholder="Choose a charge"
            value={chargeTypeId}
          />
          <FieldError errors={fieldError("chargeTypeId")} />
        </Field>
        <Field data-invalid={Boolean(fieldErrors.amount)}>
          <FieldLabel htmlFor={`${idPrefix}-amount`}>Amount (PHP)</FieldLabel>
          <Input
            aria-invalid={Boolean(fieldErrors.amount)}
            id={`${idPrefix}-amount`}
            inputMode="decimal"
            min="0"
            onChange={(event) => setAmount(event.target.value)}
            placeholder="300"
            step="1"
            type="number"
            value={amount}
          />
          <FieldError errors={fieldError("amount")} />
        </Field>
        <Field>
          <FieldLabel aria-hidden="true" className="invisible">
            Add
          </FieldLabel>
          <Button onClick={add} type="button" variant="outline">
            <Plus />
            Add
          </Button>
        </Field>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}
