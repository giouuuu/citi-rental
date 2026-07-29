"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCheck, LoaderCircle, TriangleAlert } from "lucide-react";
import { Controller, useForm } from "react-hook-form";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { acknowledgeAlertAction } from "@/features/alerts/actions/actions";
import {
  acknowledgeAlertSchema,
  type AcknowledgeAlertInput,
} from "@/features/alerts/schemas/acknowledge-alert-schema";
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";
import {
  applyServerFieldErrors,
  valuesToFormData,
} from "@/features/shared/lib/form-utils";
import type { ActionResult } from "@/features/shared/types/resource";

export function AlertResolutionForm({
  id,
  acknowledged,
  currentNote,
}: {
  id: string;
  acknowledged: boolean;
  currentNote?: string | null;
}) {
  const [state, setState] = useState<ActionResult | null>(null);
  const { isPending, runMutation } = useMutationCoordinator();
  const router = useRouter();

  const form = useForm<AcknowledgeAlertInput>({
    resolver: zodResolver(acknowledgeAlertSchema),
    defaultValues: {
      id,
      resolution_note: currentNote ?? "",
    },
  });

  function onSubmit(values: AcknowledgeAlertInput) {
    runMutation(async () => {
      const result = await acknowledgeAlertAction(valuesToFormData(values));
      setState(result);
      if (!result.success && result.fieldErrors) {
        applyServerFieldErrors(form.setError, result.fieldErrors);
      }
      if (result.success) router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resolution</CardTitle>
        <CardDescription>
          {acknowledged
            ? "This event has been acknowledged."
            : "Record the action taken before acknowledging this event."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state && !state.success ? (
          <Alert className="mb-4" variant="destructive">
            <TriangleAlert />
            <AlertTitle>Unable to acknowledge</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        ) : null}
        <form
          className="space-y-4"
          noValidate
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <input type="hidden" {...form.register("id")} />
          <Controller
            control={form.control}
            name="resolution_note"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="resolution_note">Resolution note</FieldLabel>
                <Textarea
                  {...field}
                  aria-invalid={fieldState.invalid}
                  disabled={acknowledged || isPending}
                  id="resolution_note"
                  placeholder="What was checked or resolved?"
                  rows={5}
                  value={field.value ?? ""}
                />
                {fieldState.invalid ? (
                  <FieldError errors={[fieldState.error]} />
                ) : null}
              </Field>
            )}
          />
          <Button disabled={acknowledged || isPending} type="submit">
            {isPending ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <CheckCheck />
            )}
            {acknowledged
              ? "Acknowledged"
              : isPending
                ? "Acknowledging…"
                : "Acknowledge alert"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
