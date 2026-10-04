import { PanelError } from "@/features/analytics/components/panel-error";
import { listMaintenanceAlerts, MaintenanceDueAlert } from "@/features/maintenance";

/** Fleet-wide services due soon or overdue. Renders nothing when all is on schedule. */
export async function ServiceDueAlert() {
  const result = await listMaintenanceAlerts();
  if (!result.ok) return <PanelError message={result.message} title="Service reminders" />;

  return (
    <MaintenanceDueAlert
      action={{ label: "Open maintenance", href: "/maintenance" }}
      items={result.data.map((plan) => ({
        ...plan,
        vehicleLabel: plan.plateNumber || plan.vehicleName,
        href: `/vehicles/${plan.vehicleId}?tab=maintenance`,
      }))}
    />
  );
}
