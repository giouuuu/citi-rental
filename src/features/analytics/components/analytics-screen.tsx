import { Suspense } from "react";
import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";

import { PageHeader } from "@/components/design-system/page-header";
import { Button } from "@/components/ui/button";
import {
  analyticsRangePresets,
  resolveAnalyticsWindow,
} from "@/features/analytics/lib/analytics-window";
import { AnalyticsFrame } from "@/features/analytics/components/analytics-frame";
import { AnalyticsKpis } from "@/features/analytics/components/analytics-kpis";
import { AnalyticsTrends } from "@/features/analytics/components/analytics-trends";
import { CustomerInsights } from "@/features/analytics/components/customer-insights";
import { ForwardOccupancy } from "@/features/analytics/components/forward-occupancy";
import { KpiSkeleton, PanelSkeleton } from "@/features/analytics/components/panel-skeleton";
import { VehiclePerformancePanel } from "@/features/analytics/components/vehicle-performance";
import { WebsiteAnalytics } from "@/features/analytics/components/website-analytics";
import { formatDateKey, manilaDateKey } from "@/features/shared/lib/manila-time";

type SearchParams = Record<string, string | string[] | undefined>;

export async function AnalyticsScreen({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = await searchParams;
  const read = (key: string) => {
    const value = query[key];
    return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
  };
  const window = resolveAnalyticsWindow({
    range: read("range"),
    from: read("from"),
    to: read("to"),
    bucket: read("bucket"),
  });
  const summary = `Showing ${formatDateKey(window.from)} – ${formatDateKey(window.to)} (${window.days} days, Manila time), compared with ${formatDateKey(window.previous.from)} – ${formatDateKey(window.previous.to)}.`;

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Button asChild variant="outline">
            <Link href="/reports">
              <FileSpreadsheet /> Reports & exports
            </Link>
          </Button>
        }
        breadcrumbs={[{ label: "Workspace", href: "/dashboard" }, { label: "Analytics" }]}
        description="How the fleet, customers, bookings, and the website are performing."
        title="Analytics"
      />
      <AnalyticsFrame
        bucket={window.bucket}
        bucketIsExplicit={read("bucket") === window.bucket}
        from={window.from}
        preset={window.preset}
        presets={analyticsRangePresets()}
        summary={summary}
        to={window.to}
        today={manilaDateKey(new Date())}
      >
        <Suspense fallback={<KpiSkeleton />}>
          <AnalyticsKpis window={window} />
        </Suspense>
        <WebsiteAnalytics window={window} />
        <Suspense fallback={<PanelSkeleton className="h-[560px]" label="trends" />}>
          <AnalyticsTrends
            aside={
              <Suspense fallback={<PanelSkeleton className="h-[440px]" label="forward bookings" />}>
                <ForwardOccupancy />
              </Suspense>
            }
            window={window}
          />
        </Suspense>
        <Suspense fallback={<PanelSkeleton className="h-[520px]" label="car performance" />}>
          <VehiclePerformancePanel window={window} />
        </Suspense>
        <Suspense fallback={<PanelSkeleton className="h-[520px]" label="customer insights" />}>
          <CustomerInsights window={window} />
        </Suspense>
      </AnalyticsFrame>
    </div>
  );
}
