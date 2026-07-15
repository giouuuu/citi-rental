import {
  CheckCircle2,
  CircleOff,
  RadioTower,
  Server,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/design-system/page-header";
import { StatusBadge } from "@/components/design-system/status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getIntegrationHealth } from "@/features/settings/services/settings-service";
export async function IntegrationsScreen() {
  const health = await getIntegrationHealth();
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Settings", href: "/settings" },
          { label: "Integrations" },
        ]}
        description="Server-side provider configuration and recent synchronization activity. Secret values are never rendered."
        title="Integrations"
      />
      <section className="grid gap-4 md:grid-cols-2">
        <Health
          icon={ShieldCheck}
          label="Supabase"
          ready={health.supabase}
          detail={
            health.supabase
              ? "Authentication and application data configured"
              : "Add public Supabase environment variables"
          }
        />
        <Health
          icon={Server}
          label="Traccar"
          ready={health.traccar || health.provider === "simulator"}
          detail={
            health.provider === "simulator"
              ? "Simulator mode active"
              : health.traccar
                ? `Server configured at ${health.baseUrl}`
                : "Server credentials incomplete"
          }
        />
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Recent synchronization runs</CardTitle>
          <CardDescription>
            Latest provider jobs, counts, and error summaries.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {health.logs.map((log, index) => (
            <div
              className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
              key={String(log.id ?? index)}
            >
              <div>
                <p className="text-sm font-medium">
                  {String(
                    log.sync_type ??
                      log.operation ??
                      "Position synchronization",
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {String(log.started_at ?? log.created_at ?? "")}
                </p>
              </div>
              <StatusBadge status={String(log.status ?? "unknown")} />
            </div>
          ))}
          {!health.logs.length ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <RadioTower className="mx-auto mb-3 size-8" />
              No synchronization runs recorded yet.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
function Health({
  icon: Icon,
  label,
  ready,
  detail,
}: {
  icon: typeof Server;
  label: string;
  ready: boolean;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-4 py-5">
        <div
          className={`flex size-10 items-center justify-center rounded-md ${ready ? "bg-success-surface text-success" : "bg-muted text-muted-foreground"}`}
        >
          <Icon className="size-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium">{label}</p>
            {ready ? (
              <CheckCircle2 className="size-5 text-success" />
            ) : (
              <CircleOff className="size-5 text-muted-foreground" />
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}
