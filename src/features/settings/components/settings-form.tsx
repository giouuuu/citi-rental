"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, Save, TriangleAlert } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveSettingsAction } from "@/features/settings/actions/actions";
import type { OrganizationSettings } from "@/features/settings/services/settings-service";
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";
import type { ActionResult } from "@/features/shared/types/resource";
export function SettingsForm({ settings }: { settings: OrganizationSettings }) {
  const [state, setState] = useState<ActionResult | null>(null);
  const { isPending, runMutation } = useMutationCoordinator();
  const router = useRouter();
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    runMutation(async () => {
      const result = await saveSettingsAction(data);
      setState(result);
      if (result.success) router.refresh();
    });
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization and tracking defaults</CardTitle>
        <CardDescription>
          Thresholds apply consistently to tracker status and retention
          workflows.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={submit}>
          {state ? (
            <Alert
              className={
                state.success
                  ? "border-success/20 bg-success-surface"
                  : undefined
              }
              variant={state.success ? "default" : "destructive"}
            >
              {state.success ? (
                <CheckCircle2 className="text-success" />
              ) : (
                <TriangleAlert />
              )}
              <AlertTitle>
                {state.success ? "Settings saved" : "Unable to save"}
              </AlertTitle>
              <AlertDescription>
                {state.success ? "Organization settings saved." : state.message}
              </AlertDescription>
            </Alert>
          ) : null}
          <FieldGroup className="grid gap-5 md:grid-cols-2">
            <Setting
              name="name"
              label="Organization name"
              value={settings.name}
              error={!state?.success ? state?.fieldErrors?.name : undefined}
            />
            <Setting
              name="timezone"
              label="Timezone"
              value={settings.timezone}
              error={!state?.success ? state?.fieldErrors?.timezone : undefined}
            />
            <Setting
              name="tracker_online_threshold_minutes"
              label="Online threshold (minutes)"
              value={settings.tracker_online_threshold_minutes}
              type="number"
              error={
                !state?.success
                  ? state?.fieldErrors?.tracker_online_threshold_minutes
                  : undefined
              }
            />
            <Setting
              name="tracker_delayed_threshold_minutes"
              label="Delayed threshold (minutes)"
              value={settings.tracker_delayed_threshold_minutes}
              type="number"
              error={
                !state?.success
                  ? state?.fieldErrors?.tracker_delayed_threshold_minutes
                  : undefined
              }
            />
            <Setting
              name="location_retention_days"
              label="Location retention (days)"
              value={settings.location_retention_days}
              type="number"
              error={
                !state?.success
                  ? state?.fieldErrors?.location_retention_days
                  : undefined
              }
            />
            <Field>
              <FieldLabel htmlFor="gps_provider">GPS provider</FieldLabel>
              <Select
                defaultValue={settings.gps_provider}
                disabled={isPending}
                name="gps_provider"
              >
                <SelectTrigger className="h-11! w-full" id="gps_provider">
                  <SelectValue placeholder="Select a GPS provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="simulator">Simulator</SelectItem>
                  <SelectItem value="traccar">Traccar</SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>
                Credentials remain server-only environment variables.
              </FieldDescription>
            </Field>
          </FieldGroup>
          <div className="flex justify-end border-t pt-5">
            <Button disabled={isPending}>
              {isPending ? <LoaderCircle className="animate-spin" /> : <Save />}
              {isPending ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
function Setting({
  name,
  label,
  value,
  type = "text",
  error,
}: {
  name: string;
  label: string;
  value: string | number;
  type?: string;
  error?: string[];
}) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input
        defaultValue={value}
        id={name}
        min={type === "number" ? 1 : undefined}
        name={name}
        required
        type={type}
      />
      <FieldError>{error?.[0]}</FieldError>
    </Field>
  );
}
