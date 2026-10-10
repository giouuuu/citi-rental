"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, LoaderCircle, Save } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { ResourceFormField } from "@/features/shared/components/resource-form-field";
import { ResourceRangeField } from "@/features/shared/components/resource-range-field";
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";
import {
  applyServerFieldErrors,
  valuesToFormData,
} from "@/features/shared/lib/form-utils";
import { toManilaDateTimeInput } from "@/features/shared/lib/manila-time";
import type {
  ActionResult,
  ResourceField,
  ResourceOption,
} from "@/features/shared/types/resource";
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
    // Pickers speak Manila wall-clock; stored timestamps arrive in UTC.
    if (field.type === "datetime-local" || field.type === "date-range") {
      values[field.name] = value == null ? "" : toManilaDateTimeInput(String(value));
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
  quickCreate,
  bare = false,
}: ResourceFormProps) {
  // The field a quick-create dialog is open for, and what was typed to find it.
  const [creating, setCreating] = useState<{
    field: string;
    search: string;
  } | null>(null);
  // Records made from this form, shown before the page's own list catches up.
  const [created, setCreated] = useState<Record<string, ResourceOption[]>>({});
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
        if (onSuccess) onSuccess(result.data, values);
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
      <FieldGroup className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {definition.fields.map((fieldDef) => {
          if (hidden.has(fieldDef.name) || rangeEnds.has(fieldDef.name))
            return null;
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
                blockedByKey={
                  keyField ? String(watchedValues[keyField] ?? "") : ""
                }
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
              onQuickCreate={
                quickCreate?.[fieldDef.name]
                  ? (search) => setCreating({ field: fieldDef.name, search })
                  : undefined
              }
              options={withCreated(
                references[fieldDef.name] ?? fieldDef.options ?? [],
                created[fieldDef.name],
              )}
              quickCreateLabel={quickCreate?.[fieldDef.name]?.label}
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
            {isPending ? <LoaderCircle className="animate-spin" /> : <Save />}
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      ) : null}
    </form>
  );

  const quick = creating ? quickCreate?.[creating.field] : undefined;
  const quickField = creating
    ? definition.fields.find((field) => field.name === creating.field)
    : undefined;
  // Rendered beside the form, never inside it: React events bubble through
  // portals, so a nested dialog's submit would also submit this form.
  const quickDialog =
    quick && creating && quickField ? (
      <Dialog onOpenChange={(open) => !open && setCreating(null)} open>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{quick.label}</DialogTitle>
            {quick.description ? (
              <DialogDescription>{quick.description}</DialogDescription>
            ) : null}
          </DialogHeader>
          <ResourceForm
            action={quick.action}
            bare
            definition={quick.definition}
            hiddenFields={quick.hiddenFields}
            initialValues={
              quick.searchField && creating.search
                ? { [quick.searchField]: creating.search }
                : undefined
            }
            onSuccess={(saved, values) => {
              setCreating(null);
              if (!saved) return;
              const option = {
                value: saved.id,
                label: referenceLabel(quickField, values),
              };
              setCreated((current) => ({
                ...current,
                [creating.field]: [...(current[creating.field] ?? []), option],
              }));
              form.setValue(creating.field, saved.id, {
                shouldDirty: true,
                shouldValidate: true,
              });
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    ) : null;

  if (bare)
    return (
      <>
        {formElement}
        {quickDialog}
      </>
    );

  return (
    <>
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
      {quickDialog}
    </>
  );
}

/** Same shape as loadResourceReferences labels: `Name · secondary`. */
function referenceLabel(field: ResourceField, values: Record<string, unknown>) {
  const reference = field.reference;
  if (!reference) return String(values.name ?? "New record");
  const main = String(values[reference.labelColumn] ?? "").trim();
  const secondary = reference.secondaryColumn
    ? String(values[reference.secondaryColumn] ?? "").trim()
    : "";
  return secondary ? `${main} · ${secondary}` : main || "New record";
}

function withCreated(options: ResourceOption[], created?: ResourceOption[]) {
  if (!created?.length) return options;
  const known = new Set(options.map((option) => option.value));
  return [...options, ...created.filter((option) => !known.has(option.value))];
}
