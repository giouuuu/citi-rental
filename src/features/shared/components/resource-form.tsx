"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, LoaderCircle, Save } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { ResourceFormField } from "@/features/shared/components/resource-form-field";
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";
import {
  applyServerFieldErrors,
  valuesToFormData,
} from "@/features/shared/lib/form-utils";
import type { ActionResult } from "@/features/shared/types/resource";
import type { ResourceFormProps } from "@/features/shared/types/resource-form";

type ResourceFormValues = Record<string, unknown>;

function buildDefaultValues(
  fields: ResourceFormProps["definition"]["fields"],
  row: ResourceFormProps["row"],
): ResourceFormValues {
  const values: ResourceFormValues = {};
  for (const field of fields) {
    const value = row?.[field.name];
    if (field.type === "checkbox") {
      values[field.name] = Boolean(value);
      continue;
    }
    if (field.type === "image") {
      values[field.name] = undefined;
      continue;
    }
    if (typeof value === "object" && value !== null) {
      values[field.name] = JSON.stringify(value, null, 2);
      continue;
    }
    values[field.name] = value == null ? "" : String(value);
  }
  return values;
}

export function ResourceForm({
  definition,
  row,
  references = {},
  action,
  readOnly = false,
}: ResourceFormProps) {
  const [state, setState] = useState<ActionResult<{
    id: string;
    href: string;
  }> | null>(null);
  const { isPending, runMutation } = useMutationCoordinator();
  const router = useRouter();

  const defaultValues = useMemo(
    () => buildDefaultValues(definition.fields, row),
    [definition.fields, row],
  );

  const form = useForm<ResourceFormValues>({ defaultValues });
  const watchedValues = form.watch();

  function onSubmit(values: ResourceFormValues) {
    const extras: Record<string, string> = {};
    if (row?.id) extras.__id = String(row.id);

    runMutation(async () => {
      const result = await action(valuesToFormData(values, extras));
      setState(result);
      if (!result.success && result.fieldErrors) {
        applyServerFieldErrors(form.setError, result.fieldErrors);
      }
      if (result.success) {
        toast.success(
          row
            ? `${definition.singular} saved.`
            : `${definition.singular} created.`,
        );
        if (!row && result.data?.href) router.replace(result.data.href);
        else router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>
          {readOnly
            ? `${definition.singular} details`
            : row
              ? `Edit ${definition.singular.toLowerCase()}`
              : `${definition.singular} details`}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <form
          className="space-y-6"
          encType="multipart/form-data"
          noValidate
          onSubmit={form.handleSubmit(onSubmit)}
        >
          {state && !state.success ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Unable to save</AlertTitle>
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          ) : null}
          {/* Success is a toast, not an inline alert — on create the user is
              already being routed to the new record's page. Errors stay inline,
              next to the fields that need fixing. */}
          <FieldGroup className="grid gap-5 md:grid-cols-2">
            {definition.fields.map((fieldDef) => {
              const lockSource = fieldDef.lockWhen
                ? String(
                    watchedValues[fieldDef.lockWhen.field] ??
                      row?.[fieldDef.lockWhen.field] ??
                      "",
                  )
                : "";
              const locked = Boolean(
                fieldDef.lockWhen?.values.includes(lockSource),
              );
              return (
                <ResourceFormField
                  control={form.control}
                  definitionKey={definition.key}
                  fieldDef={
                    locked && fieldDef.lockWhen?.message
                      ? {
                          ...fieldDef,
                          description: fieldDef.lockWhen.message,
                        }
                      : fieldDef
                  }
                  isPending={isPending}
                  key={fieldDef.name}
                  options={references[fieldDef.name] ?? fieldDef.options ?? []}
                  readOnly={readOnly || locked}
                  row={row}
                />
              );
            })}
          </FieldGroup>
          {!readOnly ? (
            <div className="flex justify-end border-t pt-5">
              <Button className="min-w-32" disabled={isPending} type="submit">
                {isPending ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Save />
                )}
                {isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
