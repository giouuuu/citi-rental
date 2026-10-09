"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AgreementDocument } from "@/features/agreements/components/agreement-document";
import type { AgreementDraft } from "@/features/agreements/types";
import { InspectionSignaturePad } from "@/features/inspections/components/inspection-signature-pad";
import type { InspectionType } from "@/features/inspections/types/inspection";

export type SignoffAgreement = {
  draft: AgreementDraft;
  renterAddress: string;
  accepted: boolean;
  companySignature: string | null;
  onRenterAddress: (value: string) => void;
  onAccepted: (value: boolean) => void;
  onCompanySignature: (value: string | null) => void;
};

/** Release: the prefilled rental agreement, read with the renter. */
function AgreementPanel({
  agreement,
  renterSignature,
}: {
  agreement: SignoffAgreement;
  renterSignature: string | null;
}) {
  const { draft } = agreement;
  const savedCompanySignature = draft.companySignatureUrl;
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Rental agreement</h3>
        <p className="text-xs text-muted-foreground">
          Go through it with the renter. Their signature below goes on this
          agreement and on the condition report.
        </p>
      </div>

      <div className="max-h-[28rem] overflow-y-auto rounded-lg border border-border bg-background p-4">
        <AgreementDocument
          companySignatureUrl={savedCompanySignature ?? agreement.companySignature}
          parties={{
            ...draft.parties,
            renterAddress: agreement.renterAddress.trim() || null,
          }}
          renterSignatureUrl={renterSignature}
          signedAt={null}
          terms={draft.terms}
        />
      </div>

      <Field>
        <FieldLabel htmlFor="agreement-renter-address">
          Renter&apos;s address<span className="text-destructive"> *</span>
        </FieldLabel>
        <Input
          autoComplete="street-address"
          id="agreement-renter-address"
          maxLength={300}
          placeholder="House no., street, barangay, city"
          value={agreement.renterAddress}
          onChange={(event) => agreement.onRenterAddress(event.target.value)}
        />
        <FieldDescription>
          Printed on the agreement and saved to the customer record.
        </FieldDescription>
      </Field>

      {savedCompanySignature ? (
        <p className="text-xs text-muted-foreground">
          The company&apos;s saved signature from Settings is applied.
        </p>
      ) : (
        <div className="space-y-2">
          <Label>
            Company representative signature
            <span className="text-destructive"> *</span>
          </Label>
          <InspectionSignaturePad
            label="Company representative signature"
            value={agreement.companySignature}
            onChange={agreement.onCompanySignature}
          />
          <p className="text-xs text-muted-foreground">
            Save a company signature in Settings to skip this at every release.
          </p>
        </div>
      )}
    </section>
  );
}

export function InspectionSignoffStep({
  inspectionType,
  signature,
  acknowledged,
  agreement = null,
  fuelChargeAmount,
  fuelChargeNote,
  damageChargeAmount,
  damageChargeNote,
  newDamageCount = 0,
  onSignature,
  onAcknowledged,
  onFuelChargeAmount,
  onFuelChargeNote,
  onDamageChargeAmount,
  onDamageChargeNote,
}: {
  inspectionType: InspectionType;
  signature: string | null;
  acknowledged: boolean;
  agreement?: SignoffAgreement | null;
  fuelChargeAmount: string;
  fuelChargeNote: string;
  damageChargeAmount: string;
  damageChargeNote: string;
  newDamageCount?: number;
  onSignature: (value: string | null) => void;
  onAcknowledged: (value: boolean) => void;
  onFuelChargeAmount: (value: string) => void;
  onFuelChargeNote: (value: string) => void;
  onDamageChargeAmount: (value: string) => void;
  onDamageChargeNote: (value: string) => void;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {inspectionType === "return" ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Charges</h3>
          {newDamageCount > 0 ? (
            <Alert>
              <AlertTitle>New damage detected</AlertTitle>
              <AlertDescription>
                {newDamageCount} panel
                {newDamageCount === 1 ? "" : "s"} worsened since pickup. Enter a
                damage penalty below — it posts to the rental payment ledger. Use
                0 to waive.
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-4 @md:grid-cols-2 @md:items-start">
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
                {newDamageCount > 0 ? (
                  <span className="text-destructive"> *</span>
                ) : null}
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
        </section>
      ) : null}

      {agreement ? (
        <AgreementPanel agreement={agreement} renterSignature={signature} />
      ) : null}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">
          {agreement ? "Renter signature" : "Customer signature"}
          {agreement ? <span className="text-destructive"> *</span> : null}
        </h3>
        <InspectionSignaturePad
          label={agreement ? "Renter signature" : "Customer signature"}
          value={signature}
          onChange={onSignature}
        />
      </section>

      {agreement ? (
        <label className="flex items-start gap-2.5 rounded-lg border border-border bg-card p-3 text-sm">
          <Checkbox
            checked={agreement.accepted}
            onCheckedChange={(value) => agreement.onAccepted(value === true)}
          />
          <span>
            The renter has read and agrees to the Rental Agreement and
            Cancellation Policy.<span className="text-destructive"> *</span>
          </span>
        </label>
      ) : null}

      <label className="flex items-start gap-2.5 rounded-lg border border-border bg-card p-3 text-sm">
        <Checkbox
          checked={acknowledged}
          onCheckedChange={(value) => onAcknowledged(value === true)}
        />
        <span>
          Customer acknowledges this {inspectionType} condition report.
        </span>
      </label>
    </div>
  );
}
