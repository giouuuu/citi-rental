"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, LoaderCircle, TriangleAlert } from "lucide-react";
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
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";
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
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    runMutation(async () => {
      const result = await acknowledgeAlertAction(formData);
      setState(result);
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
        <form className="space-y-4" onSubmit={submit}>
          <input name="id" type="hidden" value={id} />
          <Field
            data-invalid={Boolean(
              !state?.success && state?.fieldErrors?.resolution_note,
            )}
          >
            <FieldLabel htmlFor="resolution_note">Resolution note</FieldLabel>
            <Textarea
              defaultValue={currentNote ?? ""}
              disabled={acknowledged || isPending}
              id="resolution_note"
              name="resolution_note"
              placeholder="What was checked or resolved?"
              rows={5}
            />
            <FieldError>
              {!state?.success
                ? state?.fieldErrors?.resolution_note?.[0]
                : undefined}
            </FieldError>
          </Field>
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
