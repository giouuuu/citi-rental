import Link from "next/link";
import { StatusBadge } from "@/components/design-system/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const alerts = [
  {
    title: "Vehicle left allowed area",
    vehicle: "NCR 1842 · Toyota Vios",
    time: "8 min ago",
    status: "critical",
  },
  {
    title: "Tracker reporting delayed",
    vehicle: "VAN 5041 · Nissan Urvan",
    time: "12 min ago",
    status: "delayed",
  },
  {
    title: "Tracker connection restored",
    vehicle: "NCR 2291 · Honda City",
    time: "28 min ago",
    status: "online",
  },
];

export function RecentAlertsCard() {
  return (
    <Card className="xl:col-span-4">
      <CardHeader className="border-b">
        <CardTitle>Recent alerts</CardTitle>
        <CardDescription>Events that may need attention.</CardDescription>
        <CardAction>
          <Button asChild size="sm" variant="ghost">
            <Link href="/alerts">View all</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-1 px-0">
        {alerts.map((alert) => (
          <Link
            className="flex items-start gap-3 border-b border-border px-5 py-4 transition-colors last:border-0 hover:bg-muted/60"
            href="/alerts/demo-alert"
            key={alert.title}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{alert.title}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {alert.vehicle}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">{alert.time}</p>
            </div>
            <StatusBadge status={alert.status} />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
