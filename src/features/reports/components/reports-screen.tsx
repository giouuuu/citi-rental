import Link from "next/link";
import {
  AlertTriangle,
  CarFront,
  Download,
  KeyRound,
  RadioTower,
  Route,
} from "lucide-react";
import { PageHeader } from "@/components/design-system/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getReportSummary } from "@/features/reports/services/report-service";

const exports = [
  {
    type: "rentals",
    title: "Rental history",
    description: "Active, overdue, completed, and cancelled rental records.",
    icon: KeyRound,
  },
  {
    type: "events",
    title: "Tracking events",
    description: "Geofence, tracker, alarm, overspeed, and overdue events.",
    icon: AlertTriangle,
  },
  {
    type: "locations",
    title: "Vehicle trip points",
    description: "Detailed GPS points for authorized operational review.",
    icon: Route,
  },
  {
    type: "vehicles",
    title: "Vehicle utilization source",
    description: "Fleet status and current odometer source data.",
    icon: CarFront,
  },
];

export async function ReportsScreen() {
  const summary = await getReportSummary();
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Workspace", href: "/dashboard" },
          { label: "Reports" },
        ]}
        description="Operational exports use organization-scoped data and Philippine display time while retaining UTC source timestamps."
        title="Reports"
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Active rentals" value={summary.activeRentals} />
        <Metric label="Overdue rentals" value={summary.overdueRentals} />
        <Metric label="Unresolved alerts" value={summary.unresolvedAlerts} />
        <Metric label="Offline trackers" value={summary.offlineTrackers} />
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        {exports.map((item) => (
          <Card key={item.type}>
            <CardHeader>
              <div className="mb-2 flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <item.icon className="size-5" />
              </div>
              <CardTitle>{item.title}</CardTitle>
              <CardDescription>{item.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link href={`/reports/export?type=${item.type}`}>
                  <Download /> Export CSV
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>
      <Card className="border-info/20 bg-info-surface">
        <CardContent className="flex items-start gap-3 py-5">
          <RadioTower className="mt-0.5 size-5 text-info" />
          <div>
            <p className="font-medium">Large history safeguard</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Exports are capped at 10,000 rows. Use narrower database reporting
              windows for larger fleets.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
