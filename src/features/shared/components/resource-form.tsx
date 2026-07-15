"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, LoaderCircle, Save } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/features/shared/types/resource";
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";
import type { ResourceFormProps } from "@/features/shared/types/resource-form";

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

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    runMutation(async () => {
      const result = await action(formData);
      setState(result);
      if (result.success) {
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
        <form className="space-y-6" onSubmit={submit}>
          {row ? <input name="__id" type="hidden" value={row.id} /> : null}
          {state && !state.success ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Unable to save</AlertTitle>
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          ) : null}
          {state?.success ? (
            <Alert className="border-success/20 bg-success-surface">
              <CheckCircle2 className="text-success" />
              <AlertTitle>Saved</AlertTitle>
            </Alert>
          ) : null}
          <FieldGroup className="grid gap-5 md:grid-cols-2">
            {definition.fields.map((field) => {
              const id = `${definition.key}-${field.name}`;
              const error = !state?.success
                ? state?.fieldErrors?.[field.name]
                : undefined;
              const value = row?.[field.name];
              const displayValue =
                typeof value === "object" && value !== null
                  ? JSON.stringify(value, null, 2)
                  : String(value ?? "");
              const options = references[field.name] ?? field.options ?? [];
              return (
                <Field
                  className={field.className}
                  data-invalid={Boolean(error)}
                  key={field.name}
                >
                  {field.type === "checkbox" ? (
                    <div className="flex min-h-12 items-start gap-3 rounded-md border bg-muted/30 p-3">
                      <Checkbox
                        defaultChecked={Boolean(value)}
                        disabled={readOnly || isPending}
                        id={id}
                        name={field.name}
                      />
                      <div>
                        <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
                        {field.description ? (
                          <FieldDescription>
                            {field.description}
                          </FieldDescription>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <>
                      <FieldLabel htmlFor={id}>
                        {field.label}
                        {field.required ? (
                          <span aria-hidden="true" className="text-destructive">
                            *
                          </span>
                        ) : null}
                      </FieldLabel>
                      {field.type === "textarea" ? (
                        <Textarea
                          defaultValue={displayValue}
                          disabled={readOnly || isPending}
                          id={id}
                          name={field.name}
                          placeholder={field.placeholder}
                          rows={4}
                        />
                      ) : field.type === "select" ? (
                        <Select
                          defaultValue={displayValue}
                          disabled={readOnly || isPending}
                          name={field.name}
                          required={field.required}
                        >
                          <SelectTrigger
                            aria-invalid={Boolean(error)}
                            className="h-11! w-full"
                            id={id}
                          >
                            <SelectValue
                              placeholder={`Select ${field.label.toLowerCase()}`}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {options.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          defaultValue={displayValue}
                          disabled={readOnly || isPending}
                          id={id}
                          name={field.name}
                          placeholder={field.placeholder}
                          required={field.required}
                          step={field.step}
                          type={field.type ?? "text"}
                        />
                      )}
                      {field.description ? (
                        <FieldDescription>{field.description}</FieldDescription>
                      ) : null}
                    </>
                  )}
                  <FieldError>{error?.[0]}</FieldError>
                </Field>
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
