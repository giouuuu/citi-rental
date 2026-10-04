import { Suspense } from "react";
import Link from "next/link";
import { CalendarClock, CarFront, ChartNoAxesCombined, KeyRound, Plus, TriangleAlert } from "lucide-react";

import { MetricCard } from "@/components/design-system/metric-card";
import { PageHeader } from "@/components/design-system/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { hoursLate } from "@/features/dashboard/lib/build-dashboard-snapshot";
import { getDashboardSnapshot } from "@/features/dashboard/services/get-dashboard-snapshot";
import { AttentionCard } from "@/features/dashboard/components/attention-card";
import { DueBackTable } from "@/features/dashboard/components/due-back-table";
import { MonthToDateCard } from "@/features/dashboard/components/month-to-date-card";
import { PickupsCard } from "@/features/dashboard/components/pickups-card";
import { RecentBookingsCard } from "@/features/dashboard/components/recent-bookings-card";
import { ServiceDueAlert } from "@/features/dashboard/components/service-due-alert";
import { formatManila } from "@/features/shared/lib/manila-time";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function DashboardScreen() {
  const demoMode = !isSupabaseConfigured();
  const snapshot = await getDashboardSnapshot();

  return (
    <div className="space-y-8">
      <PageHeader
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/analytics">
                <ChartNoAxesCombined /> Analytics
              </Link>
            </Button>
            <Button asChild>
              <Link href="/rentals/new">
                <Plus /> New rental
              </Link>
            </Button>
          </>
        }
        description="Today's returns, pickups, and anything that needs a follow-up."
        eyebrow={formatManila(new Date(), "weekday")}
        title="Operations overview"
      />
      {demoMode ? (
        <Alert className="border-info/20 bg-info-surface">
          <CarFront className="text-info" />
          <AlertTitle>Demo workspace</AlertTitle>
          <AlertDescription>
            Showing sample fleet and rental data. Add Supabase environment keys to see your live
            workspace.
          </AlertDescription>
        </Alert>
      ) : null}
      {snapshot ? (
        <>
          <section aria-labelledby="fleet-metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <h2 className="sr-only" id="fleet-metrics">
              Fleet metrics
            </h2>
            <MetricCard
              icon={CarFront}
              label="Fleet"
              note={`${snapshot.fleet.available} available · ${snapshot.fleet.maintenance} in maintenance`}
              tone="brand"
              value={String(snapshot.fleet.total)}
            />
            <MetricCard
              icon={KeyRound}
              label="On rent now"
              note={`${snapshot.dueBackToday.length} due back today`}
              tone="teal"
              value={String(snapshot.onRentNow)}
            />
            <MetricCard
              icon={TriangleAlert}
              label="Overdue"
              note={
                snapshot.overdue.length
                  ? `Longest ${hoursLate(snapshot.overdue[0])} hours past due`
                  : "Every rental is on time"
              }
              tone="danger"
              value={String(snapshot.overdue.length)}
            />
            <MetricCard
              icon={CalendarClock}
              label="Pickups today"
              note={`${snapshot.upcomingPickups.length} more this week · ${snapshot.awaitingDeposit.length} awaiting deposit`}
              tone="gold"
              value={String(snapshot.pickupsToday.length)}
            />
          </section>
          {demoMode ? null : (
            <Suspense fallback={null}>
              <ServiceDueAlert />
            </Suspense>
          )}
          <section className="grid gap-4 xl:grid-cols-12">
            <Card className="xl:col-span-8">
              <CardHeader className="border-b">
                <CardTitle>Due back today</CardTitle>
                <CardDescription>Expected returns in Philippine Standard Time.</CardDescription>
                <CardAction>
                  <Button asChild size="sm" variant="ghost">
                    <Link href="/rentals">All rentals</Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <DueBackTable rentals={snapshot.dueBackToday} />
              </CardContent>
            </Card>
            <AttentionCard snapshot={snapshot} />
          </section>
          <section className="grid gap-4 xl:grid-cols-12">
            <PickupsCard snapshot={snapshot} />
            <RecentBookingsCard snapshot={snapshot} />
            <Suspense fallback={<Skeleton className="h-72 rounded-lg xl:col-span-3" />}>
              <MonthToDateCard todayKey={snapshot.todayKey} />
            </Suspense>
          </section>
        </>
      ) : (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>The dashboard could not load</AlertTitle>
          <AlertDescription>
            Fleet and rental data did not come back. Reload the page; if it keeps failing, check the
            database connection.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
