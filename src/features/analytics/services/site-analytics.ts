import "server-only";

import { runAnalyticsRpc } from "@/features/analytics/services/run-analytics-rpc";
import type {
  AnalyticsBucket,
  AnalyticsResult,
  SiteFunnel,
  SiteFunnelRow,
  SiteLive,
  SiteTimeseriesPoint,
  SiteVehicleInterest,
} from "@/features/analytics/types/analytics";
import { isSupabaseConfigured } from "@/lib/supabase/env";

type FunnelRow = {
  is_total: boolean;
  source: string | null;
  visitors: number;
  sessions: number;
  page_views: number;
  car_viewers: number;
  booking_starters: number;
  bookers: number;
  payers: number;
  bookings: number;
  paid_bookings: number;
};

const EMPTY_TOTAL: SiteFunnelRow = {
  isTotal: true,
  source: "all",
  visitors: 0,
  sessions: 0,
  pageViews: 0,
  carViewers: 0,
  bookingStarters: 0,
  bookers: 0,
  payers: 0,
  bookings: 0,
  paidBookings: 0,
};

/** Demo mode has no visitors to show. */
function empty<T>(data: T): Promise<AnalyticsResult<T>> {
  return Promise.resolve({ ok: true, data });
}

export function getSiteFunnel(from: string, to: string): Promise<AnalyticsResult<SiteFunnel>> {
  if (!isSupabaseConfigured()) return empty({ total: EMPTY_TOTAL, sources: [] });

  return runAnalyticsRpc<FunnelRow, SiteFunnel>(
    "analytics_site_funnel",
    { p_from: from, p_to: to },
    (rows) => {
      const mapped = rows.map<SiteFunnelRow>((row) => ({
        isTotal: Boolean(row.is_total),
        source: row.source ?? "all",
        visitors: Number(row.visitors),
        sessions: Number(row.sessions),
        pageViews: Number(row.page_views),
        carViewers: Number(row.car_viewers),
        bookingStarters: Number(row.booking_starters),
        bookers: Number(row.bookers),
        payers: Number(row.payers),
        bookings: Number(row.bookings),
        paidBookings: Number(row.paid_bookings),
      }));
      return {
        total: mapped.find((row) => row.isTotal) ?? EMPTY_TOTAL,
        sources: mapped.filter((row) => !row.isTotal),
      };
    },
  );
}

type VehicleRow = {
  vehicle_id: string;
  plate_number: string;
  name: string;
  category: string | null;
  views: number;
  viewers: number;
  facebook_viewers: number;
  booking_starters: number;
  bookings: number;
  paid_bookings: number;
};

export function listSiteVehicleInterest(
  from: string,
  to: string,
): Promise<AnalyticsResult<SiteVehicleInterest[]>> {
  if (!isSupabaseConfigured()) return empty([]);

  return runAnalyticsRpc<VehicleRow, SiteVehicleInterest[]>(
    "analytics_site_vehicles",
    { p_from: from, p_to: to },
    (rows) =>
      rows.map((row) => ({
        vehicleId: row.vehicle_id,
        plateNumber: row.plate_number,
        name: row.name,
        category: row.category,
        views: Number(row.views),
        viewers: Number(row.viewers),
        facebookViewers: Number(row.facebook_viewers),
        bookingStarters: Number(row.booking_starters),
        bookings: Number(row.bookings),
        paidBookings: Number(row.paid_bookings),
      })),
  );
}

type TimeseriesRow = {
  bucket_start: string;
  visitors: number;
  facebook_visitors: number;
  bookings: number;
};

export function getSiteTimeseries(
  from: string,
  to: string,
  bucket: AnalyticsBucket,
): Promise<AnalyticsResult<SiteTimeseriesPoint[]>> {
  if (!isSupabaseConfigured()) return empty([]);

  return runAnalyticsRpc<TimeseriesRow, SiteTimeseriesPoint[]>(
    "analytics_site_timeseries",
    { p_from: from, p_to: to, p_bucket: bucket },
    (rows) =>
      rows.map((row) => ({
        bucketStart: row.bucket_start,
        visitors: Number(row.visitors),
        facebookVisitors: Number(row.facebook_visitors),
        bookings: Number(row.bookings),
      })),
  );
}

type LiveRow = { visitors_now: number; facebook_now: number; visitors_today: number };

export function getSiteLive(): Promise<AnalyticsResult<SiteLive>> {
  if (!isSupabaseConfigured()) return empty({ visitorsNow: 0, facebookNow: 0, visitorsToday: 0 });

  return runAnalyticsRpc<LiveRow, SiteLive>("analytics_site_live", {}, (rows) => ({
    visitorsNow: Number(rows[0]?.visitors_now ?? 0),
    facebookNow: Number(rows[0]?.facebook_now ?? 0),
    visitorsToday: Number(rows[0]?.visitors_today ?? 0),
  }));
}
