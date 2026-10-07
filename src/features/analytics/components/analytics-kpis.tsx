import {
  cancellationRate,
  lateReturnRate,
  periodDelta,
  pointsDelta,
  revenuePerFleetDay,
  utilizationPercent,
} from "@/features/analytics/lib/analytics-metrics";
import { getAnalyticsOverview } from "@/features/analytics/services/get-analytics-overview";
import type { AnalyticsWindow } from "@/features/analytics/types/analytics";
import { KpiTile } from "@/features/analytics/components/kpi-tile";
import { PanelError } from "@/features/analytics/components/panel-error";
import { formatPhp } from "@/features/shared/lib/money";

function formatRate(value: number | null) {
  return value === null ? "—" : `${value}%`;
}

function formatDays(value: number | null) {
  return value === null ? "—" : `${value} ${value === 1 ? "day" : "days"}`;
}

/** Headline numbers for the window, each compared with the previous window. */
export async function AnalyticsKpis({ window }: { window: AnalyticsWindow }) {
  const [current, previous] = await Promise.all([
    getAnalyticsOverview(window.from, window.to),
    getAnalyticsOverview(window.previous.from, window.previous.to),
  ]);

  if (!current.ok) return <PanelError message={current.message} title="Headline numbers" />;
  const now = current.data;
  const before = previous.ok ? previous.data : null;

  const utilization = utilizationPercent(now.rentedVehicleDays, now.fleetVehicleDays);
  const previousUtilization = before
    ? utilizationPercent(before.rentedVehicleDays, before.fleetVehicleDays)
    : null;
  const cancelRate = cancellationRate(now);
  const lateRate = lateReturnRate(now);
  const perDay = revenuePerFleetDay(now);
  const websiteShare = now.bookingsCreated
    ? Math.round((now.bookingsPublic / now.bookingsCreated) * 100)
    : null;

  return (
    <section aria-labelledby="analytics-headline" className="space-y-4">
      <h2 className="sr-only" id="analytics-headline">
        Headline numbers
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          delta={before ? periodDelta(now.collected, before.collected) : null}
          label="Collected revenue"
          note={
            now.refunds
              ? `Net of ${formatPhp(now.refunds)} refunded. Charges are not counted until paid.`
              : "Deposits and balances received. Charges are not counted until paid."
          }
          value={formatPhp(now.collected)}
        />
        <KpiTile
          delta={before ? periodDelta(now.bookingsCreated, before.bookingsCreated) : null}
          label="Bookings"
          note={
            websiteShare === null
              ? "No bookings in this period."
              : `${websiteShare}% from the website · ${now.draftsOpen} awaiting deposit`
          }
          value={now.bookingsCreated.toLocaleString("en-PH")}
        />
        <KpiTile
          delta={pointsDelta(utilization, previousUtilization)}
          deltaSuffix=" pts"
          label="Fleet utilization"
          note={`${now.rentedVehicleDays} of ${now.fleetVehicleDays} car-days rented${
            perDay === null ? "" : ` · ${formatPhp(perDay)} per car-day`
          }`}
          value={formatRate(utilization)}
        />
        <KpiTile
          label="Outstanding balance"
          note="Still owed on cars that have gone out, including unpaid charges. Reserved balances are due at pickup."
          value={formatPhp(now.outstandingBalance)}
        />
        <KpiTile
          delta={before ? periodDelta(now.cancellations, before.cancellations) : null}
          goodWhen="down"
          label="Cancellation rate"
          note={`${now.cancellations} cancelled of ${now.bookingsCreated} booked`}
          value={formatRate(cancelRate)}
        />
        <KpiTile
          delta={before ? periodDelta(now.lateReturns, before.lateReturns) : null}
          goodWhen="down"
          label="Late returns"
          note={`${now.lateReturns} of ${now.completedRentals} returns over an hour late · ${now.overdueNow} overdue now`}
          value={formatRate(lateRate)}
        />
        <KpiTile
          label="Average rental"
          note={`Booked ${formatDays(now.avgLeadTimeDays)} ahead on average`}
          value={formatDays(now.avgRentalDays)}
        />
        <KpiTile
          delta={before ? periodDelta(now.penaltiesBilled, before.penaltiesBilled) : null}
          goodWhen="down"
          label="Charges billed"
          note="Fuel and damage charges from return inspections."
          value={formatPhp(now.penaltiesBilled)}
        />
      </div>
    </section>
  );
}
