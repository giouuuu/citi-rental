import { PageHeader } from "@/components/design-system/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { PanelError } from "@/features/analytics/components/panel-error";
import { listMaintenanceSchedule } from "@/features/maintenance";
import { MaintenanceScheduleTable } from "@/features/maintenance/components/maintenance-schedule-table";
import { MAINTENANCE_LIST } from "@/features/maintenance/lib/maintenance-options";
import { manilaDateKey } from "@/features/shared/lib/manila-time";
import { parseResourceQuery } from "@/features/shared/schemas/resource-query-schema";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseResourceQuery(await searchParams, MAINTENANCE_LIST);
  const result = isSupabaseConfigured()
    ? await listMaintenanceSchedule(query)
    : ({ ok: false, message: "Connect Supabase to track maintenance." } as const);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Vehicles", href: "/vehicles" }, { label: "Maintenance" }]}
        description="Every car's service schedule, most urgent first. Recording a service books its cost as that car's expense."
        title="Maintenance"
      />
      {result.ok ? (
        <Card>
          <CardContent className="pt-5">
            <MaintenanceScheduleTable
              hasNextPage={result.data.hasNextPage}
              query={query}
              rows={result.data.rows}
              today={manilaDateKey(new Date())}
            />
          </CardContent>
        </Card>
      ) : (
        <PanelError message={result.message} title="Maintenance" />
      )}
    </div>
  );
}
