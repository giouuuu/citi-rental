import { Suspense } from "react";
import Link from "next/link";
import { CarFront, Globe } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChartDataTable } from "@/features/analytics/components/chart-data-table";
import { CopyLinkButton } from "@/features/analytics/components/copy-link-button";
import { KpiTile } from "@/features/analytics/components/kpi-tile";
import { PanelError } from "@/features/analytics/components/panel-error";
import { PanelSkeleton } from "@/features/analytics/components/panel-skeleton";
import { SiteLiveTile } from "@/features/analytics/components/site-live-tile";
import { SiteVisitorsChart } from "@/features/analytics/components/site-visitors-chart";
import {
  conversionPercent,
  periodDelta,
  pointsDelta,
} from "@/features/analytics/lib/analytics-metrics";
import { bucketLabel } from "@/features/analytics/lib/trend-series";
import {
  getSiteFunnel,
  getSiteLive,
  getSiteTimeseries,
  listSiteVehicleInterest,
} from "@/features/analytics/services/site-analytics";
import type { AnalyticsWindow, SiteFunnelRow } from "@/features/analytics/types/analytics";
import { ExportRowsButton } from "@/features/shared/components/export-rows-button";
import { sourceLabel } from "@/features/site-analytics/lib/traffic-source";
import { PUBLIC_SITE_URL } from "@/lib/site-url";

const GRAIN_LABEL = { day: "Daily", week: "Weekly (from Monday)", month: "Monthly" } as const;

function rateLabel(value: number | null) {
  return value === null ? "—" : `${value}%`;
}

function count(value: number) {
  return value.toLocaleString("en-PH");
}

/** Visit → book stages, each counting visitors who got at least that far. */
function funnelStages(row: SiteFunnelRow) {
  return [
    { label: "Visited the site", value: row.visitors },
    { label: "Looked at a car", value: row.carViewers },
    { label: "Started a booking", value: row.bookingStarters },
    { label: "Submitted a booking", value: row.bookers },
    { label: "Paid the reservation fee", value: row.payers },
  ];
}

const SOURCE_COLUMNS = [
  { key: "source", header: "Source" },
  { key: "visitors", header: "Visitors", format: "number" },
  { key: "sessions", header: "Visits", format: "number" },
  { key: "carViewers", header: "Looked at a car", format: "number" },
  { key: "bookingStarters", header: "Started booking", format: "number" },
  { key: "bookers", header: "Booked", format: "number" },
  { key: "payers", header: "Paid", format: "number" },
  { key: "bookRate", header: "Visit → booked", format: "percent" },
  { key: "bookings", header: "Bookings", format: "number" },
  { key: "paidBookings", header: "Paid bookings", format: "number" },
] as const;

/**
 * The customer site: who is on it now, where visitors came from (Facebook
 * links carry `?fb`), and how many of them get from opening the site to a
 * paid booking.
 */
export function WebsiteAnalytics({ window }: { window: AnalyticsWindow }) {
  return (
    <section aria-labelledby="analytics-website" className="space-y-4">
      <h2 className="sr-only" id="analytics-website">
        Website & Facebook
      </h2>
      <Suspense fallback={<PanelSkeleton className="h-[640px]" label="website visitors" />}>
        <SiteOverview window={window} />
      </Suspense>
      <Suspense fallback={<PanelSkeleton className="h-[420px]" label="most viewed cars" />}>
        <SiteCars window={window} />
      </Suspense>
    </section>
  );
}

async function SiteOverview({ window }: { window: AnalyticsWindow }) {
  const [live, current, previous, series] = await Promise.all([
    getSiteLive(),
    getSiteFunnel(window.from, window.to),
    getSiteFunnel(window.previous.from, window.previous.to),
    getSiteTimeseries(window.from, window.to, window.bucket),
  ]);
  if (!current.ok) return <PanelError message={current.message} title="Website visitors" />;

  const total = current.data.total;
  const before = previous.ok ? previous.data.total : null;
  const facebook = current.data.sources.find((row) => row.source === "facebook");
  const facebookBefore = previous.ok
    ? previous.data.sources.find((row) => row.source === "facebook")
    : undefined;
  const bookRate = conversionPercent(total.bookers, total.visitors);
  const bookRateBefore = before ? conversionPercent(before.bookers, before.visitors) : null;
  const facebookShare = conversionPercent(facebook?.visitors ?? 0, total.visitors);
  const facebookLink = `${PUBLIC_SITE_URL}/?fb`;
  const grain = GRAIN_LABEL[window.bucket];
  const chartRows = series.ok
    ? series.data.map((point) => ({
        label: bucketLabel(point.bucketStart, window.bucket),
        bucketStart: point.bucketStart,
        facebook: point.facebookVisitors,
        other: Math.max(0, point.visitors - point.facebookVisitors),
        bookings: point.bookings,
      }))
    : [];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {live.ok ? (
          <SiteLiveTile initial={live.data} />
        ) : (
          <PanelError message={live.message} title="Live visitors" />
        )}
        <KpiTile
          delta={before ? periodDelta(total.visitors, before.visitors) : null}
          label="Visitors"
          note={`${count(total.sessions)} visits · ${count(total.pageViews)} pages viewed`}
          value={count(total.visitors)}
        />
        <KpiTile
          delta={periodDelta(facebook?.visitors ?? 0, facebookBefore?.visitors ?? 0)}
          label="From Facebook"
          note={
            facebookShare === null
              ? "No visitors in this period."
              : `${facebookShare}% of visitors · ${count(facebook?.bookings ?? 0)} booked`
          }
          value={count(facebook?.visitors ?? 0)}
        />
        <KpiTile
          delta={pointsDelta(bookRate, bookRateBefore)}
          deltaSuffix=" pts"
          label="Visit → booking rate"
          note={`${count(total.bookings)} bookings from the site · ${count(total.paidBookings)} paid`}
          value={rateLabel(bookRate)}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-5">
          <CardHeader>
            <CardTitle>Open → book</CardTitle>
            <CardDescription>
              How far visitors got. Each step counts people, so it can only narrow.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FunnelBars row={total} />
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-2 border-t">
            <p className="text-xs text-muted-foreground">
              Post this link on Facebook so its clicks are counted. Name a post with{" "}
              <code className="font-mono">?fb=oct-promo</code>.
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-2 py-1.5 font-mono text-xs">
                {facebookLink}
              </code>
              <CopyLinkButton label="Facebook link" url={facebookLink} />
            </div>
          </CardFooter>
        </Card>

        <Card className="xl:col-span-7">
          <CardHeader>
            <CardTitle>Visitors</CardTitle>
            <CardDescription>{grain} unique visitors, Facebook first.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {series.ok ? (
              <>
                <SiteVisitorsChart ariaLabel={`${grain} website visitors`} rows={chartRows} />
                <ChartDataTable
                  caption="Website visitors by period"
                  columns={["Period", "Visitors", "From Facebook", "Bookings"]}
                  exportFileName="website-visitors"
                  exportFormats={["text", "number", "number", "number"]}
                  rows={chartRows.map((row) => ({
                    key: row.bucketStart,
                    cells: [
                      row.label,
                      count(row.facebook + row.other),
                      count(row.facebook),
                      count(row.bookings),
                    ],
                    raw: [row.label, row.facebook + row.other, row.facebook, row.bookings],
                  }))}
                />
              </>
            ) : (
              <PanelError message={series.message} title="Visitors chart" />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Where visitors come from</CardTitle>
          <CardDescription>
            A visitor keeps the last source they arrived from for 30 days, so a Facebook click
            that books two days later still counts for Facebook.
          </CardDescription>
          <CardAction>
            <ExportRowsButton
              fileName="website-sources"
              sheets={[
                {
                  name: "Sources",
                  columns: [...SOURCE_COLUMNS],
                  rows: [...current.data.sources, total].map((row) => {
                    const rate = conversionPercent(row.bookers, row.visitors);
                    return {
                      source: row.isTotal ? "All sources" : sourceLabel(row.source),
                      visitors: row.visitors,
                      sessions: row.sessions,
                      carViewers: row.carViewers,
                      bookingStarters: row.bookingStarters,
                      bookers: row.bookers,
                      payers: row.payers,
                      bookRate: rate === null ? null : rate / 100,
                      bookings: row.bookings,
                      paidBookings: row.paidBookings,
                    };
                  }),
                },
              ]}
            />
          </CardAction>
        </CardHeader>
        <CardContent>
          {current.data.sources.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Visitors</TableHead>
                    <TableHead className="text-right">Looked at a car</TableHead>
                    <TableHead className="text-right">Started booking</TableHead>
                    <TableHead className="text-right">Booked</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Visit → booked</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...current.data.sources, total].map((row) => (
                    <TableRow
                      className={row.isTotal ? "font-medium" : undefined}
                      key={row.isTotal ? "__total" : row.source}
                    >
                      <TableCell>{row.isTotal ? "All sources" : sourceLabel(row.source)}</TableCell>
                      <TableCell className="text-right tabular-nums">{count(row.visitors)}</TableCell>
                      <TableCell className="text-right tabular-nums">{count(row.carViewers)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {count(row.bookingStarters)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{count(row.bookers)}</TableCell>
                      <TableCell className="text-right tabular-nums">{count(row.payers)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {rateLabel(conversionPercent(row.bookers, row.visitors))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Globe />
                </EmptyMedia>
                <EmptyTitle>No visitors in this period</EmptyTitle>
                <EmptyDescription>
                  Visits to the customer site show here. Share the Facebook link above to start
                  counting clicks.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FunnelBars({ row }: { row: SiteFunnelRow }) {
  const stages = funnelStages(row);

  return (
    <ol className="space-y-4">
      {stages.map((stage, index) => {
        const ofVisitors = conversionPercent(stage.value, row.visitors);
        const ofPrevious = index ? conversionPercent(stage.value, stages[index - 1].value) : null;
        return (
          <li className="space-y-1.5" key={stage.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{stage.label}</span>
              <span className="tabular-nums">
                {count(stage.value)}
                <span className="ml-2 text-xs text-muted-foreground">{rateLabel(ofVisitors)}</span>
              </span>
            </div>
            <div aria-hidden="true" className="h-2 rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-chart-1"
                style={{ width: `${Math.min(100, ofVisitors ?? 0)}%` }}
              />
            </div>
            {index ? (
              <p className="text-xs text-muted-foreground">
                {ofPrevious === null ? "—" : `${ofPrevious}%`} of the step before
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

async function SiteCars({ window }: { window: AnalyticsWindow }) {
  const result = await listSiteVehicleInterest(window.from, window.to);
  if (!result.ok) return <PanelError message={result.message} title="Most viewed cars" />;

  const rows = result.data;
  const anyViews = rows.some((row) => row.viewers > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Most viewed cars</CardTitle>
        <CardDescription>
          Ranked by people who opened the car&apos;s photos or its booking page. View → booked shows
          which cars turn interest into bookings.
        </CardDescription>
        <CardAction>
          <ExportRowsButton
            fileName="most-viewed-cars"
            sheets={[
              {
                name: "Most viewed cars",
                columns: [
                  { key: "plateNumber", header: "Plate number" },
                  { key: "name", header: "Car" },
                  { key: "category", header: "Category" },
                  { key: "views", header: "Photo views", format: "number" },
                  { key: "viewers", header: "People", format: "number" },
                  { key: "facebookViewers", header: "From Facebook", format: "number" },
                  { key: "bookingStarters", header: "Started booking", format: "number" },
                  { key: "bookings", header: "Bookings", format: "number" },
                  { key: "paidBookings", header: "Paid bookings", format: "number" },
                  { key: "viewToBook", header: "View → booked", format: "percent" },
                ],
                rows: rows.map((row) => {
                  const rate = conversionPercent(row.bookings, row.viewers);
                  return {
                    plateNumber: row.plateNumber,
                    name: row.name,
                    category: row.category,
                    views: row.views,
                    viewers: row.viewers,
                    facebookViewers: row.facebookViewers,
                    bookingStarters: row.bookingStarters,
                    bookings: row.bookings,
                    paidBookings: row.paidBookings,
                    viewToBook: rate === null ? null : rate / 100,
                  };
                }),
              },
            ]}
          />
        </CardAction>
      </CardHeader>
      <CardContent>
        {anyViews ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 text-right">#</TableHead>
                  <TableHead>Car</TableHead>
                  <TableHead className="text-right">People</TableHead>
                  <TableHead className="text-right">Photo views</TableHead>
                  <TableHead className="text-right">From Facebook</TableHead>
                  <TableHead className="text-right">Started booking</TableHead>
                  <TableHead className="text-right">Booked</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">View → booked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={row.vehicleId}>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      <Link className="font-medium hover:underline" href={`/vehicles/${row.vehicleId}`}>
                        {row.plateNumber}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {row.name}
                        {row.category ? ` · ${row.category}` : ""}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{count(row.viewers)}</TableCell>
                    <TableCell className="text-right tabular-nums">{count(row.views)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {count(row.facebookViewers)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {count(row.bookingStarters)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{count(row.bookings)}</TableCell>
                    <TableCell className="text-right tabular-nums">{count(row.paidBookings)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {rateLabel(conversionPercent(row.bookings, row.viewers))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CarFront />
              </EmptyMedia>
              <EmptyTitle>No car views in this period</EmptyTitle>
              <EmptyDescription>
                Cars show here once visitors open their photos or start a booking.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}
