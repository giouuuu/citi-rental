import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { periodDelta, percent, pointsDelta } from "@/features/analytics/lib/analytics-metrics";
import {
  bookedInWindow,
  bookingFunnel,
  bookingTrend,
  cancelAfterBookingMix,
  cancelledByMix,
  cancelledInWindow,
  cancelNoticeMix,
  cancelReasonMix,
  cancelStageMix,
  carSegments,
  channelSegments,
  leadTimeMix,
  pickupLocationMix,
  pickupWeekdayMix,
  statusMix,
  summarizeBookings,
  tripLengthMix,
  type BreakdownItem,
} from "@/features/analytics/lib/booking-analytics";
import { listBookingRows } from "@/features/analytics/services/list-booking-rows";
import type { AnalyticsWindow } from "@/features/analytics/types/analytics";
import {
  BookingsTable,
  CancelledBookingsTable,
  CarBookingsTable,
  ChannelTable,
} from "@/features/analytics/components/booking-tables";
import { BookingTrendChart } from "@/features/analytics/components/booking-trend-chart";
import { BreakdownChart } from "@/features/analytics/components/breakdown-chart";
import { ChartDataTable } from "@/features/analytics/components/chart-data-table";
import { KpiTile } from "@/features/analytics/components/kpi-tile";
import { PanelError } from "@/features/analytics/components/panel-error";
import { formatPhp } from "@/features/shared/lib/money";

const GRAIN_LABEL = { day: "Daily", week: "Weekly (from Monday)", month: "Monthly" } as const;

function formatRate(value: number | null) {
  return value === null ? "—" : `${value}%`;
}

function formatDays(value: number | null) {
  return value === null ? "—" : `${value} ${value === 1 ? "day" : "days"}`;
}

function formatHours(value: number | null) {
  if (value === null) return "—";
  if (value < 1) return "within an hour";
  if (value < 48) return `${Math.round(value)} hours`;
  return `${Math.round(value / 24)} days`;
}

/** One breakdown: bars, plus the same numbers as a table with an Excel export. */
function BreakdownCard({
  title,
  description,
  items,
  fileName,
  className,
  shareOf,
}: {
  title: string;
  description: string;
  items: BreakdownItem[];
  fileName: string;
  className?: string;
  /** Denominator for the Share column; defaults to the sum of the bars. */
  shareOf?: number;
}) {
  const total = shareOf ?? items.reduce((sum, item) => sum + item.value, 0);
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {total ? (
          <BreakdownChart ariaLabel={title} items={items} />
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing to show for this period.</p>
        )}
        <ChartDataTable
          caption={title}
          columns={["Category", "Bookings", "Share"]}
          exportFileName={fileName}
          exportFormats={["text", "number", "percent"]}
          rows={items.map((item) => {
            const share = percent(item.value, total);
            return {
              key: item.key,
              cells: [item.label, String(item.value), share === null ? "—" : `${share}%`],
              raw: [item.label, item.value, total ? item.value / total : null],
            };
          })}
        />
      </CardContent>
    </Card>
  );
}

export async function BookingAnalytics({ window }: { window: AnalyticsWindow }) {
  const [current, previous] = await Promise.all([
    listBookingRows(window.from, window.to),
    listBookingRows(window.previous.from, window.previous.to),
  ]);
  if (!current.ok) return <PanelError message={current.message} title="Booking analytics" />;

  const rows = current.data;
  const now = summarizeBookings(rows, window.from, window.to);
  const before = previous.ok
    ? summarizeBookings(previous.data, window.previous.from, window.previous.to)
    : null;
  const booked = bookedInWindow(rows, window.from, window.to);
  const cancelled = cancelledInWindow(rows, window.from, window.to);
  const trend = bookingTrend(rows, window.from, window.to, window.bucket);
  const grain = GRAIN_LABEL[window.bucket];

  return (
    <div className="space-y-8">
      <section aria-labelledby="bookings-headline" className="space-y-4">
        <h2 className="sr-only" id="bookings-headline">
          Booking headline numbers
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile
            delta={before ? periodDelta(now.booked, before.booked) : null}
            label="Bookings made"
            note={`${now.website} website · ${now.frontDesk} front desk · ${now.withDriver} with driver`}
            value={now.booked.toLocaleString("en-PH")}
          />
          <KpiTile
            delta={pointsDelta(now.paidRate, before?.paidRate ?? null)}
            deltaSuffix=" pts"
            label="Paid bookings"
            note={`${now.feePaid} of ${now.booked} have a confirmed payment · ${now.awaitingPayment} still awaiting payment`}
            value={formatRate(now.paidRate)}
          />
          <KpiTile
            delta={before ? periodDelta(now.bookedValue, before.bookedValue) : null}
            label="Booked value"
            note={
              now.avgBookingValue === null
                ? "Quoted totals of bookings not cancelled."
                : `${formatPhp(now.avgBookingValue)} per booking on average · cancelled bookings left out`
            }
            value={formatPhp(now.bookedValue)}
          />
          <KpiTile
            label="Booked ahead"
            note={`Average trip ${formatDays(now.avgTripDays)}`}
            value={formatDays(now.avgLeadDays)}
          />
          <KpiTile
            delta={before ? periodDelta(now.cancellations, before.cancellations) : null}
            goodWhen="down"
            label="Cancellations"
            note={`${now.cancelledByCustomer} by customers online · ${now.cancelledByStaff} by staff`}
            value={now.cancellations.toLocaleString("en-PH")}
          />
          <KpiTile
            delta={pointsDelta(now.cancelRate, before?.cancelRate ?? null)}
            deltaSuffix=" pts"
            goodWhen="down"
            label="Cancellation rate"
            note={`${now.cancelledOfBooked} of ${now.booked} bookings made this period are now cancelled`}
            value={formatRate(now.cancelRate)}
          />
          <KpiTile
            delta={before ? periodDelta(now.cancelledBeforePayment, before.cancelledBeforePayment) : null}
            goodWhen="down"
            label="Cancelled before payment"
            note={`${now.cancelledPaymentPending} had sent payment not yet confirmed · ${now.cancelledAfterPayment} after payment`}
            value={now.cancelledBeforePayment.toLocaleString("en-PH")}
          />
          <KpiTile
            delta={before ? periodDelta(now.lostValue, before.lostValue) : null}
            goodWhen="down"
            label="Value lost to cancellations"
            note={`Refunded ${formatPhp(now.refundedOnCancellations)} · kept ${formatPhp(now.keptFromCancellations)}${
              now.feesForfeited ? ` (${now.feesForfeited} late-cancel fees)` : ""
            }`}
            value={formatPhp(now.lostValue)}
          />
        </div>
      </section>

      <section aria-labelledby="bookings-flow" className="space-y-4">
        <h2 className="text-lg font-semibold" id="bookings-flow">
          Bookings over time
        </h2>
        <div className="grid gap-4 xl:grid-cols-12">
          <Card className="xl:col-span-7">
            <CardHeader>
              <CardTitle>Booked vs cancelled</CardTitle>
              <CardDescription>
                {grain} bookings made, beside bookings cancelled in the same period.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <BookingTrendChart ariaLabel={`${grain} bookings made and cancelled`} rows={trend} />
              <ChartDataTable
                caption="Bookings made and cancelled by period"
                columns={["Period", "Booked", "Cancelled"]}
                exportFileName="bookings-vs-cancellations"
                exportFormats={["text", "number", "number"]}
                rows={trend.map((row) => ({
                  key: row.bucketStart,
                  cells: [row.label, String(row.booked), String(row.cancelled)],
                  raw: [row.label, row.booked, row.cancelled],
                }))}
              />
            </CardContent>
          </Card>
          <BreakdownCard
            className="xl:col-span-5"
            description="How far the bookings made this period got. Share is of all bookings made."
            fileName="booking-funnel"
            items={bookingFunnel(now)}
            shareOf={now.booked}
            title="Booking funnel"
          />
        </div>
      </section>

      <section aria-labelledby="bookings-cancellations" className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold" id="bookings-cancellations">
            Cancellations
          </h2>
          <p className="text-sm text-muted-foreground">
            {now.cancellations
              ? `${now.cancellations} cancelled this period. Typically cancelled ${formatHours(now.medianHoursToCancel)} after booking (median).`
              : "Nothing was cancelled in this period."}
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <BreakdownCard
            description="Where the money stood when the booking was cancelled."
            fileName="cancellations-by-payment"
            items={cancelStageMix(cancelled)}
            title="Payment at cancellation"
          />
          <BreakdownCard
            description="Most common reasons first."
            fileName="cancellation-reasons"
            items={cancelReasonMix(cancelled)}
            title="Reasons"
          />
          <BreakdownCard
            description="Customers cancelling on the website, or staff cancelling in the ops app."
            fileName="cancellations-by-who"
            items={cancelledByMix(cancelled)}
            title="Who cancelled"
          />
          <BreakdownCard
            description="Time left before the pickup when the booking was cancelled."
            fileName="cancellation-notice"
            items={cancelNoticeMix(cancelled)}
            title="Notice before pickup"
          />
          <BreakdownCard
            description="How soon after booking the customer or staff cancelled."
            fileName="cancellation-after-booking"
            items={cancelAfterBookingMix(cancelled)}
            title="Time after booking"
          />
          <BreakdownCard
            description="Where bookings made this period stand now."
            fileName="booking-status"
            items={statusMix(booked)}
            title="Status now"
          />
        </div>
        <CancelledBookingsTable rows={cancelled} />
      </section>

      <section aria-labelledby="bookings-patterns" className="space-y-4">
        <h2 className="text-lg font-semibold" id="bookings-patterns">
          Booking patterns
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <BreakdownCard
            description="Days between booking and pickup."
            fileName="booking-lead-time"
            items={leadTimeMix(booked)}
            title="How far ahead"
          />
          <BreakdownCard
            description="Booked length, pickup to return."
            fileName="booking-trip-length"
            items={tripLengthMix(booked)}
            title="Trip length"
          />
          <BreakdownCard
            description="Day of the week the car is picked up."
            fileName="booking-pickup-day"
            items={pickupWeekdayMix(booked)}
            title="Pickup day"
          />
          <BreakdownCard
            description="Most-requested pickup spots."
            fileName="booking-pickup-locations"
            items={pickupLocationMix(booked)}
            title="Pickup location"
          />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <ChannelTable segments={channelSegments(booked)} />
          <CarBookingsTable cars={carSegments(booked)} />
        </div>
      </section>

      <BookingsTable rows={booked} />
    </div>
  );
}
