"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { LoaderCircle, Save, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { saveAgreementSettingsAction } from "@/features/agreements/actions/save-agreement-settings-action";
import type { AgreementSettings } from "@/features/agreements/services/get-agreement-settings";
import { InspectionSignaturePad } from "@/features/inspections/components/inspection-signature-pad";
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";
import type { ActionResult } from "@/features/shared/types/resource";

const FIELDS = [
  {
    name: "legal_name",
    label: "Business name",
    description: "Printed at the top of the agreement and on the company signature line.",
    placeholder: "Zeke's Car Rental Services",
  },
  {
    name: "business_address",
    label: "Business address",
    description: "Printed under the business name.",
    placeholder: "Block 24 Lot 19 Grand Terrace Heights, Consolacion, 6001",
  },
  {
    name: "contact_email",
    label: "Email on the agreement",
    description: "The phone comes from the Phone contact channel above.",
    placeholder: "zekecebucarrental@gmail.com",
  },
] as const;

type FieldName = (typeof FIELDS)[number]["name"];

export function AgreementSettingsCard({ settings }: { settings: AgreementSettings }) {
  const router = useRouter();
  const { isPending, runMutation } = useMutationCoordinator();
  const [values, setValues] = useState<Record<FieldName, string>>({
    legal_name: settings.legalName,
    business_address: settings.businessAddress,
    contact_email: settings.contactEmail,
  });
  const [replacing, setReplacing] = useState(!settings.signatureUrl);
  const [signature, setSignature] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData();
    for (const field of FIELDS) data.set(field.name, values[field.name]);
    if (replacing && signature) data.set("signature_data_url", signature);
    runMutation(async () => {
      const next = await saveAgreementSettingsAction(data);
      setResult(next);
      if (next.success) {
        toast.success("Rental agreement settings saved.");
        setSignature(null);
        setReplacing(false);
        router.refresh();
      }
    });
  }

  const fieldErrors = result && !result.success ? result.fieldErrors : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rental agreement</CardTitle>
        <CardDescription>
          The company details and signature filled into the agreement the
          renter signs when a car is released.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" noValidate onSubmit={submit}>
          {result && !result.success ? (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>Unable to save</AlertTitle>
              <AlertDescription>{result.message}</AlertDescription>
            </Alert>
          ) : null}

          <FieldGroup className="grid items-start gap-5 md:grid-cols-2">
            {FIELDS.map((field) => {
              const errors = fieldErrors?.[field.name];
              return (
                <Field
                  key={field.name}
                  className={field.name === "business_address" ? "md:col-span-2" : undefined}
                  data-invalid={Boolean(errors?.length)}
                >
                  <FieldLabel htmlFor={`agreement-${field.name}`}>{field.label}</FieldLabel>
                  <Input
                    aria-invalid={Boolean(errors?.length)}
                    disabled={isPending}
                    id={`agreement-${field.name}`}
                    inputMode={field.name === "contact_email" ? "email" : undefined}
                    placeholder={field.placeholder}
                    value={values[field.name]}
                    onChange={(event) =>
                      setValues((prev) => ({ ...prev, [field.name]: event.target.value }))
                    }
                  />
                  <FieldDescription>{field.description}</FieldDescription>
                  {errors?.length ? (
                    <FieldError errors={errors.map((message) => ({ message }))} />
                  ) : null}
                </Field>
              );
            })}
          </FieldGroup>

          <section className="space-y-2 border-t pt-5">
            <div>
              <h3 className="text-sm font-medium">Company signature</h3>
              <p className="text-sm text-muted-foreground">
                Applied to every agreement at release. Without one, staff sign
                for the company each time.
              </p>
            </div>
            {!replacing && settings.signatureUrl ? (
              <div className="flex flex-wrap items-end gap-3">
                <div className="rounded-md border bg-white p-2">
                  <Image
                    alt="Saved company signature"
                    className="h-16 w-auto object-contain"
                    height={64}
                    src={settings.signatureUrl}
                    unoptimized
                    width={240}
                  />
                </div>
                <Button
                  disabled={isPending}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => setReplacing(true)}
                >
                  Replace signature
                </Button>
              </div>
            ) : (
              <div className="max-w-md">
                <InspectionSignaturePad
                  label="Company signature"
                  value={signature}
                  onChange={setSignature}
                />
              </div>
            )}
          </section>

          <div className="flex justify-end border-t pt-5">
            <Button disabled={isPending} type="submit">
              {isPending ? <LoaderCircle className="animate-spin" /> : <Save />}
              {isPending ? "Saving…" : "Save agreement settings"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
