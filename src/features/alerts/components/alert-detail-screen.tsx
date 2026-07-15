import {
  CheckCircle2,
  Clock3,
  MapPin,
  Navigation,
  TriangleAlert,
} from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/design-system/page-header";
import { StatusBadge } from "@/components/design-system/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { alertDefinition } from "@/features/alerts/schemas/alert-definition";
import { AlertResolutionForm } from "@/features/alerts/components/alert-resolution-form";

async function getAlert(id: string) {
  if (!isSupabaseConfigured())
    return alertDefinition.demoRows?.find((row) => row.id === id) ?? null;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) throw new Error("Your session expired. Sign in and try again.");
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_active)
    throw new Error("Your profile is not active for this organization.");
  const { data, error } = await supabase
    .from("tracking_events")
    .select(
      "id, event_type, severity, event_timestamp, created_at, speed_kph, latitude, longitude, is_acknowledged, resolution_note",
    )
    .eq("organization_id", profile.organization_id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

function formatDate(value: unknown) {
  return value
    ? new Intl.DateTimeFormat("en-PH", {
        dateStyle: "medium",
        timeStyle: "medium",
        timeZone: "Asia/Manila",
      }).format(new Date(String(value)))
    : "Not available";
}

export async function AlertDetailScreen({
  id,
  acknowledged,
}: {
  id: string;
  acknowledged?: boolean;
}) {
  const row = await getAlert(id);
  if (!row) notFound();
  const isAcknowledged = Boolean(row.is_acknowledged);
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Alerts", href: "/alerts" },
          { label: String(row.event_type).replaceAll("_", " ") },
        ]}
        description="Tracking event details and acknowledgement history."
        title={String(row.event_type).replaceAll("_", " ")}
      />
      {acknowledged ? (
        <Alert className="border-success/20 bg-success-surface">
          <CheckCircle2 className="text-success" />
          <AlertTitle>Alert acknowledged</AlertTitle>
          <AlertDescription>
            The resolution is recorded in the event history.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Event information</CardTitle>
              <div className="flex gap-2">
                <StatusBadge status={String(row.severity) as never} />
                <StatusBadge
                  status={isAcknowledged ? "completed" : "warning"}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Info
              icon={TriangleAlert}
              label="Event type"
              value={String(row.event_type).replaceAll("_", " ")}
            />
            <Info
              icon={Clock3}
              label="Device timestamp"
              value={formatDate(row.event_timestamp)}
            />
            <Info
              icon={Clock3}
              label="Received"
              value={formatDate(row.created_at)}
            />
            <Info
              icon={Navigation}
              label="Speed"
              value={
                row.speed_kph == null ? "Not reported" : `${row.speed_kph} km/h`
              }
            />
            <Info
              icon={MapPin}
              label="Latitude"
              value={String(row.latitude ?? "Not reported")}
            />
            <Info
              icon={MapPin}
              label="Longitude"
              value={String(row.longitude ?? "Not reported")}
            />
          </CardContent>
        </Card>
        <AlertResolutionForm
          acknowledged={isAcknowledged}
          currentNote={row.resolution_note as string | null}
          id={id}
        />
      </div>
    </div>
  );
}

function Info({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border bg-muted/25 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </div>
      <p className="break-words text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}
