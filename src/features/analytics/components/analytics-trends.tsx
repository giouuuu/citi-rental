import type { ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toTrendRows } from "@/features/analytics/lib/trend-series";
import { getAnalyticsTimeseries } from "@/features/analytics/services/get-analytics-timeseries";
import type { AnalyticsWindow } from "@/features/analytics/types/analytics";
import { ChartDataTable } from "@/features/analytics/components/chart-data-table";
import { PanelError } from "@/features/analytics/components/panel-error";
import { TrendChart } from "@/features/analytics/components/trend-chart";
import { formatPhp } from "@/features/shared/lib/money";

const GRAIN_LABEL = { day: "Daily", week: "Weekly (from Monday)", month: "Monthly" } as const;

/** `aside` sits beside the revenue chart (the forward-bookings panel). */
export async function AnalyticsTrends({ window, aside }: { window: AnalyticsWindow; aside?: ReactNode }) {
  const result = await getAnalyticsTimeseries(window.from, window.to, window.bucket);
  if (!result.ok) return <PanelError message={result.message} title="Trends" />;

  const rows = toTrendRows(result.data, window.bucket);
  const grain = GRAIN_LABEL[window.bucket];

  return (
    <section aria-labelledby="analytics-trends" className="space-y-4">
      <h2 className="text-lg font-semibold" id="analytics-trends">
        Trends
      </h2>
      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardHeader>
            <CardTitle>Collected revenue</CardTitle>
            <CardDescription>{grain} money received, net of refunds.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <TrendChart ariaLabel={`${grain} collected revenue`} rows={rows} variant="collected" />
            <ChartDataTable
              caption="Collected revenue by period"
              columns={["Period", "Collected"]}
              exportFileName="collected-revenue"
              exportFormats={["text", "money"]}
              rows={rows.map((row) => ({
                key: row.bucketStart,
                cells: [row.label, formatPhp(row.collected)],
                raw: [row.label, row.collected],
              }))}
            />
          </CardContent>
        </Card>
        <div className="xl:col-span-4">{aside}</div>
        <Card className="xl:col-span-6">
          <CardHeader>
            <CardTitle>Bookings by source</CardTitle>
            <CardDescription>
              Website bookings vs rentals entered by the front desk.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <TrendChart ariaLabel={`${grain} bookings by source`} rows={rows} variant="bookings" />
            <ChartDataTable
              caption="Bookings by source and period"
              columns={["Period", "Website", "Front desk", "Cancelled"]}
              exportFileName="bookings-by-source"
              exportFormats={["text", "number", "number", "number"]}
              rows={rows.map((row) => ({
                key: row.bucketStart,
                cells: [row.label, String(row.website), String(row.frontDesk), String(row.cancellations)],
                raw: [row.label, row.website, row.frontDesk, row.cancellations],
              }))}
            />
          </CardContent>
        </Card>
        <Card className="xl:col-span-6">
          <CardHeader>
            <CardTitle>Fleet utilization</CardTitle>
            <CardDescription>Share of available car-days that were rented.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <TrendChart ariaLabel={`${grain} fleet utilization`} rows={rows} variant="utilization" />
            <ChartDataTable
              caption="Fleet utilization by period"
              columns={["Period", "Utilization"]}
              exportFileName="fleet-utilization"
              exportFormats={["text", "percent"]}
              rows={rows.map((row) => ({
                key: row.bucketStart,
                cells: [row.label, row.utilization === null ? "—" : `${row.utilization}%`],
                raw: [row.label, row.utilization === null ? null : row.utilization / 100],
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
