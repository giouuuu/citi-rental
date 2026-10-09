"use client";

import { useState } from "react";
import { Printer } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AgreementDocument } from "@/features/agreements/components/agreement-document";
import type { AgreementDraft } from "@/features/agreements/types";
import { InspectionSignaturePad } from "@/features/inspections/components/inspection-signature-pad";

/**
 * Try the agreement before a real release: the rental's own details, plus a
 * test address and signatures that stay in this page. Nothing is saved, and
 * the printout is stamped as a preview so it can't pass for a signed copy.
 */
export function AgreementPreview({
  draft,
  previewedAt,
}: {
  draft: AgreementDraft;
  previewedAt: string;
}) {
  const [address, setAddress] = useState(draft.parties.renterAddress ?? "");
  const [renterSignature, setRenterSignature] = useState<string | null>(null);
  const [companySignature, setCompanySignature] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 print:p-0">
      <div className="space-y-4 print:hidden">
        <Alert>
          <AlertTitle>Preview only, nothing is saved</AlertTitle>
          <AlertDescription>
            The renter, license, car and dates come from this rental. Type an
            address and draw signatures below to see them on the agreement,
            then print or choose &quot;Save as PDF&quot;. The real agreement is
            signed during the release inspection.
          </AlertDescription>
        </Alert>

        <Field>
          <FieldLabel htmlFor="preview-address">Renter&apos;s address</FieldLabel>
          <Input
            id="preview-address"
            placeholder="House no., street, barangay, city"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
          <FieldDescription>
            Prefilled from the customer record. Changes here are not saved.
          </FieldDescription>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
          <div className="space-y-2">
            <p className="text-sm font-medium">Test renter signature</p>
            <InspectionSignaturePad
              label="Test renter signature"
              value={renterSignature}
              onChange={setRenterSignature}
            />
          </div>
          {draft.companySignatureUrl ? (
            <p className="text-sm text-muted-foreground">
              The company&apos;s saved signature from Settings is shown on the
              agreement.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium">Test company signature</p>
              <InspectionSignaturePad
                label="Test company signature"
                value={companySignature}
                onChange={setCompanySignature}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button type="button" onClick={() => window.print()}>
            <Printer /> Print / Save as PDF
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background p-6 print:rounded-none print:border-0 print:p-0">
        <p className="mb-6 rounded-md border-2 border-dashed border-destructive/60 px-3 py-2 text-center text-xs font-semibold tracking-widest text-destructive uppercase">
          Preview — not a signed agreement
        </p>
        <AgreementDocument
          companySignatureUrl={draft.companySignatureUrl ?? companySignature}
          parties={{ ...draft.parties, renterAddress: address.trim() || null }}
          renterSignatureUrl={renterSignature}
          signedAt={previewedAt}
          terms={draft.terms}
        />
      </div>
    </div>
  );
}
