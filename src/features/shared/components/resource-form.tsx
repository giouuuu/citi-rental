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
import { ResourceRangeField } from "@/features/shared/components/resource-range-field";
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
  initialValues: ResourceFormProps["initialValues"],
): ResourceFormValues {
  const values: ResourceFormValues = {};
  for (const field of fields) {
    const value = row ? row[field.name] : initialValues?.[field.name];
    if (field.type === "checkbox" && typeof value === "string") {
      values[field.name] = value === "true" || value === "on";
      continue;
    }
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
  blockedRanges = {},
  action,
  readOnly = false,
  initialValues,
  hiddenFields,
  onSuccess,
  bare = false,
}: ResourceFormProps) {
  const [state, setState] = useState<ActionResult<{
    id: string;
    href: string;
  }> | null>(null);
  const { isPending, runMutation } = useMutationCoordinator();
  const router = useRouter();

  const defaultValues = useMemo(
    () => buildDefaultValues(definition.fields, row, initialValues),
    [definition.fields, row, initialValues],
  );
  const hidden = new Set(hiddenFields);
  // A range's end is edited by its start's calendar, never on its own.
  const rangeEnds = new Set(
    definition.fields.flatMap((field) =>
      field.type === "date-range" && field.range ? [field.range.endField] : [],
    ),
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
        if (onSuccess) onSuccess();
        else if (!row && result.data?.href) router.replace(result.data.href);
        else router.refresh();
      }
    });
  }

  const formElement = (
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
          if (hidden.has(fieldDef.name) || rangeEnds.has(fieldDef.name)) return null;
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
          if (fieldDef.type === "date-range" && fieldDef.range) {
            const keyField = fieldDef.range.blockedBy?.field;
            return (
              <ResourceRangeField
                blocked={blockedRanges[fieldDef.name]}
                blockedByKey={keyField ? String(watchedValues[keyField] ?? "") : ""}
                control={form.control}
                definitionKey={definition.key}
                fieldDef={{
                  ...fieldDef,
                  range: fieldDef.range,
                  ...(locked && fieldDef.lockWhen?.message
                    ? { description: fieldDef.lockWhen.message }
                    : {}),
                }}
                isPending={isPending}
                key={fieldDef.name}
                readOnly={readOnly || locked}
              />
            );
          }
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
          <Button
            className="min-w-32"
            data-resource-submit=""
            disabled={isPending}
            type="submit"
          >
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
  );

  if (bare) return formElement;

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
      <CardContent className="pt-6">{formElement}</CardContent>
    </Card>
  );
}
