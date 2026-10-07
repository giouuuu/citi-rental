import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { forwardBookedPercent, toTrendRows } from "@/features/analytics/lib/trend-series";
import { getAnalyticsTimeseries } from "@/features/analytics/services/get-analytics-timeseries";
import { ChartDataTable } from "@/features/analytics/components/chart-data-table";
import { PanelError } from "@/features/analytics/components/panel-error";
import { TrendChart } from "@/features/analytics/components/trend-chart";
import { addDaysToKey, manilaDateKey } from "@/features/shared/lib/manila-time";

const FORWARD_DAYS = 30;

function share(value: number | null) {
  return value === null ? "—" : `${value}%`;
}

/**
 * How full the next 30 days already are. Independent of the page's window —
 * it always looks ahead from today, so owners can see soft weeks early.
 */
export async function ForwardOccupancy() {
  const today = manilaDateKey(new Date());
  const result = await getAnalyticsTimeseries(today, addDaysToKey(today, FORWARD_DAYS - 1), "day");
  if (!result.ok) return <PanelError message={result.message} title="Forward bookings" />;

  const rows = toTrendRows(result.data, "day");
  const week = forwardBookedPercent(result.data, 7);
  const month = forwardBookedPercent(result.data, FORWARD_DAYS);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Booked ahead</CardTitle>
        <CardDescription>
          Share of the fleet already reserved for each of the next {FORWARD_DAYS} days.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-4">
          <div className="rounded-md border p-3">
            <dt className="text-xs text-muted-foreground">Next 7 days</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums">{share(week)}</dd>
          </div>
          <div className="rounded-md border p-3">
            <dt className="text-xs text-muted-foreground">Next {FORWARD_DAYS} days</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums">{share(month)}</dd>
          </div>
        </dl>
        <TrendChart ariaLabel="Share of fleet booked, next 30 days" rows={rows} variant="utilization" />
        <ChartDataTable
          caption="Share of fleet booked per day, next 30 days"
          columns={["Day", "Booked"]}
          exportFileName="booked-ahead"
          exportFormats={["text", "percent"]}
          rows={rows.map((row) => ({
            key: row.bucketStart,
            cells: [row.label, share(row.utilization)],
            raw: [row.label, row.utilization === null ? null : row.utilization / 100],
          }))}
        />
      </CardContent>
    </Card>
  );
}
