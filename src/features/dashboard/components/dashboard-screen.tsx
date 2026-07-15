import Link from "next/link";
import {
  ArrowUpRight,
  CarFront,
  KeyRound,
  Map,
  Navigation,
  Plus,
  RadioTower,
  TriangleAlert,
} from "lucide-react";

import { MapPreview } from "@/components/design-system/map-preview";
import { MetricCard } from "@/components/design-system/metric-card";
import { PageHeader } from "@/components/design-system/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { RecentAlertsCard } from "@/features/dashboard/components/recent-alerts-card";
import { RentalsDueSection } from "@/features/dashboard/components/rentals-due-section";

export function DashboardScreen() {
  const demoMode = !isSupabaseConfigured();
  return (
    <div className="space-y-8">
      <PageHeader
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/map">
                <Map /> Open fleet map
              </Link>
            </Button>
            <Button asChild>
              <Link href="/rentals/new">
                <Plus /> New rental
              </Link>
            </Button>
          </>
        }
        description="Fleet activity, rental movements, and tracker health at a glance."
        eyebrow="Monday · 13 July 2026"
        title="Operations overview"
      />
      {demoMode ? (
        <Alert className="border-info/20 bg-info-surface">
          <RadioTower className="text-info" />
          <AlertTitle>Simulator workspace</AlertTitle>
          <AlertDescription>
            Sample operational data is active. Add Supabase environment keys to
            enable authenticated live data.
          </AlertDescription>
        </Alert>
      ) : null}
      <section
        aria-labelledby="fleet-metrics"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <h2 className="sr-only" id="fleet-metrics">
          Fleet metrics
        </h2>
        <MetricCard
          icon={CarFront}
          label="Total fleet"
          note="18 available · 2 maintenance"
          tone="brand"
          value="28"
        />
        <MetricCard
          icon={KeyRound}
          label="Active rentals"
          note="3 due for return today"
          tone="gold"
          value="11"
        />
        <MetricCard
          icon={Navigation}
          label="Vehicles moving"
          note="Updated 47 seconds ago"
          tone="teal"
          value="7"
        />
        <MetricCard
          icon={TriangleAlert}
          label="Tracker alerts"
          note="1 critical · 2 need review"
          tone="danger"
          value="3"
        />
      </section>
      <section className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardHeader className="border-b">
            <CardTitle>Fleet activity</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="inline-flex items-center gap-1.5 text-teal-700">
                <span className="size-2 rounded-full bg-teal-500" /> Live
                simulator
              </span>
              <span aria-hidden="true">·</span>Last synchronized 47 seconds ago
            </CardDescription>
            <CardAction>
              <Button asChild size="sm" variant="ghost">
                <Link href="/map">
                  Full map <ArrowUpRight />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <MapPreview className="min-h-[410px]" />
          </CardContent>
        </Card>
        <RecentAlertsCard />
      </section>
      <RentalsDueSection />
    </div>
  );
}
