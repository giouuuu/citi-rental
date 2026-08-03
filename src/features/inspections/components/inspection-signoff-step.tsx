"use client";

import { LoaderCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InspectionSignaturePad } from "@/features/inspections/components/inspection-signature-pad";
import type { InspectionType } from "@/features/inspections/types/inspection";

export function InspectionSignoffStep({
  inspectionType,
  signature,
  acknowledged,
  fuelChargeAmount,
  fuelChargeNote,
  damageChargeAmount,
  damageChargeNote,
  newDamageCount = 0,
  pending,
  onSignature,
  onAcknowledged,
  onFuelChargeAmount,
  onFuelChargeNote,
  onDamageChargeAmount,
  onDamageChargeNote,
  onSubmit,
}: {
  inspectionType: InspectionType;
  signature: string | null;
  acknowledged: boolean;
  fuelChargeAmount: string;
  fuelChargeNote: string;
  damageChargeAmount: string;
  damageChargeNote: string;
  newDamageCount?: number;
  pending: boolean;
  onSignature: (value: string | null) => void;
  onAcknowledged: (value: boolean) => void;
  onFuelChargeAmount: (value: string) => void;
  onFuelChargeNote: (value: string) => void;
  onDamageChargeAmount: (value: string) => void;
  onDamageChargeNote: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-4">
      {inspectionType === "return" ? (
        <div className="space-y-3">
          {newDamageCount > 0 ? (
            <Alert>
              <AlertTitle>New damage detected</AlertTitle>
              <AlertDescription>
                {newDamageCount} panel
                {newDamageCount === 1 ? "" : "s"} worsened since pickup. Enter a
                damage penalty below — it posts to the rental payment ledger.
                Use 0 to waive.
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
            <div className="space-y-1.5">
              <Label htmlFor="fuel-charge">Fuel shortfall charge (₱)</Label>
              <Input
                id="fuel-charge"
                inputMode="decimal"
                min={0}
                type="number"
                value={fuelChargeAmount}
                onChange={(event) => onFuelChargeAmount(event.target.value)}
              />
              <Textarea
                placeholder="Fuel charge note"
                rows={2}
                value={fuelChargeNote}
                onChange={(event) => onFuelChargeNote(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="damage-charge">
                Damage penalty (₱)
                {newDamageCount > 0 ? " *" : ""}
              </Label>
              <Input
                id="damage-charge"
                inputMode="decimal"
                min={0}
                type="number"
                value={damageChargeAmount}
                onChange={(event) => onDamageChargeAmount(event.target.value)}
              />
              <Textarea
                placeholder="Damage penalty note (shown on payment ledger)"
                rows={2}
                value={damageChargeNote}
                onChange={(event) => onDamageChargeNote(event.target.value)}
              />
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label>Customer signature</Label>
        <InspectionSignaturePad value={signature} onChange={onSignature} />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          checked={acknowledged}
          onCheckedChange={(value) => onAcknowledged(value === true)}
        />
        <span>
          Customer acknowledges this {inspectionType} condition report.
        </span>
      </label>

      <Button disabled={pending} type="button" onClick={onSubmit}>
        {pending ? <LoaderCircle className="animate-spin" /> : null}
        {inspectionType === "pickup"
          ? "Submit pickup & start rental"
          : "Submit return & complete rental"}
      </Button>
    </div>
  );
}
