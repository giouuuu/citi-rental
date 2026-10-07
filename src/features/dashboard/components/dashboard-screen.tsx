import { Suspense } from "react";
import Link from "next/link";
import {
  CalendarCheck,
  CarFront,
  ChartNoAxesCombined,
  KeyRound,
  Plus,
  TriangleAlert,
  Wallet,
} from "lucide-react";

import { MetricCard } from "@/components/design-system/metric-card";
import { PageHeader } from "@/components/design-system/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingsToConfirmCard } from "@/features/dashboard/components/bookings-to-confirm-card";
import { FleetBoardCard } from "@/features/dashboard/components/fleet-board-card";
import { HandoversCard } from "@/features/dashboard/components/handovers-card";
import { MonthToDateCard } from "@/features/dashboard/components/month-to-date-card";
import { ServiceDueAlert } from "@/features/dashboard/components/service-due-alert";
import { hoursLate, lateness } from "@/features/dashboard/lib/build-dashboard-snapshot";
import { getDashboardSnapshot } from "@/features/dashboard/services/get-dashboard-snapshot";
import type { DashboardSnapshot } from "@/features/dashboard/types/dashboard";
import { formatManila } from "@/features/shared/lib/manila-time";
import { formatPhp } from "@/features/shared/lib/money";
import { FleetBookingsSection } from "@/features/vehicles/components/fleet-bookings-section";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/** Today's numbers: what moves, what's late, what's free, what came in. */
function TodayMetrics({ snapshot }: { snapshot: DashboardSnapshot }) {
  const nextRelease = snapshot.handoversToday.find((h) => h.kind === "release");
  const latePickups = snapshot.handoversToday.filter((h) => h.kind === "late_pickup").length;
  const goingOut = [
    snapshot.releasedToday ? `${snapshot.releasedToday} already out` : null,
    latePickups ? `${latePickups} late ${latePickups === 1 ? "pickup" : "pickups"}` : null,
    nextRelease ? `next at ${formatManila(nextRelease.at, "time")}` : latePickups ? null : "none left to release",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section
      aria-labelledby="today-metrics"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
    >
      <h2 className="sr-only" id="today-metrics">
        Today at a glance
      </h2>
      <MetricCard
        icon={KeyRound}
        label="Going out today"
        note={goingOut}
        tone="gold"
        value={String(snapshot.pickupsToday.length)}
      />
      <MetricCard
        icon={CalendarCheck}
        label="Coming back today"
        note={`${snapshot.returnedToday} already returned`}
        tone="teal"
        value={String(snapshot.dueBackToday.length)}
      />
      <MetricCard
        icon={TriangleAlert}
        label="Overdue"
        note={
          snapshot.overdue.length
            ? `Longest ${lateness(hoursLate(snapshot.overdue[0]))}`
            : "Every rental is on time"
        }
        tone="danger"
        value={String(snapshot.overdue.length)}
      />
      <MetricCard
        icon={CarFront}
        label="Free to rent now"
        note={`of ${snapshot.fleet.total} cars · ${snapshot.onRentNow} out · ${snapshot.fleet.maintenance} in maintenance`}
        tone="brand"
        value={String(snapshot.freeNow)}
      />
      <MetricCard
        icon={Wallet}
        label="Collected today"
        note={
          snapshot.toCollectToday > 0
            ? `${formatPhp(snapshot.toCollectToday)} still to collect on today's handovers`
            : "Nothing left to collect on today's handovers"
        }
        tone="teal"
        value={formatPhp(snapshot.collectedToday)}
      />
    </section>
  );
}

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
        description="Cars going out and coming back, bookings waiting on you, and where every car is. Philippine time."
        eyebrow={formatManila(new Date(), "weekday")}
        title="Today"
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
          <TodayMetrics snapshot={snapshot} />
          {demoMode ? null : (
            <Suspense fallback={null}>
              <ServiceDueAlert />
            </Suspense>
          )}
          <section className="grid gap-4 xl:grid-cols-12">
            <HandoversCard today={snapshot.handoversToday} tomorrow={snapshot.handoversTomorrow} />
            <BookingsToConfirmCard snapshot={snapshot} />
          </section>
          <FleetBookingsSection
            cars={snapshot.vehicles.map((vehicle) => ({
              id: vehicle.id,
              plateNumber: vehicle.plateNumber,
              name: vehicle.name || null,
            }))}
          />
          <section className="grid gap-4 xl:grid-cols-12">
            <FleetBoardCard snapshot={snapshot} />
            <Suspense fallback={<Skeleton className="h-72 rounded-lg xl:col-span-4" />}>
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
