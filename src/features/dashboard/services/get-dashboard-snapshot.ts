import "server-only";

import { unstable_rethrow } from "next/navigation";

import { buildDashboardSnapshot } from "@/features/dashboard/lib/build-dashboard-snapshot";
import type {
  DashboardRental,
  DashboardRentalStatus,
  DashboardSnapshot,
} from "@/features/dashboard/types/dashboard";
import { isPublicCustomerBooking, isRentalOverdue } from "@/features/rentals";
import { buildDemoWorkspace } from "@/features/shared/lib/demo-workspace";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const OPEN_STATUSES = ["draft", "reserved", "active", "overdue"] as const;

type Joined<T> = T | T[] | null;
type OpenRentalRow = {
  id: string;
  reference_number: string;
  status: string;
  start_at: string;
  expected_return_at: string;
  created_at: string;
  customers: Joined<{ full_name: string | null }>;
  vehicles: Joined<{ plate_number: string | null; name: string | null }>;
};

function one<T>(value: Joined<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function deriveStatus(status: string, expectedReturnAt: string, now: Date): DashboardRentalStatus {
  // Between overdue sweeps a late rental is still stored as active.
  if (isRentalOverdue({ status, expectedReturnAt }, now)) return "overdue";
  return status as DashboardRentalStatus;
}

function demoSnapshot(now: Date): DashboardSnapshot {
  const workspace = buildDemoWorkspace(now);
  const customers = new Map(workspace.customers.map((c) => [c.id, c]));
  const vehicles = new Map(workspace.vehicles.map((v) => [v.id, v]));
  const rentals: DashboardRental[] = workspace.rentals
    .filter((r) => (OPEN_STATUSES as readonly string[]).includes(r.status))
    .map((r) => ({
      id: r.id,
      reference: r.referenceNumber,
      customerName: customers.get(r.customerId)?.fullName ?? "—",
      vehiclePlate: vehicles.get(r.vehicleId)?.plateNumber ?? "—",
      vehicleName: vehicles.get(r.vehicleId)?.name ?? "",
      status: deriveStatus(r.status, r.expectedReturnAt, now),
      source: r.bookingSource,
      startAt: r.startAt,
      expectedReturnAt: r.expectedReturnAt,
      createdAt: r.createdAt,
    }));
  return buildDashboardSnapshot({
    vehicleStatuses: workspace.vehicles.map((v) => v.status),
    rentals,
    now,
  });
}

/**
 * Live operational picture: fleet counts and every open rental, bucketed by
 * Manila day. Returns null (and logs) on failure so the dashboard can say so
 * instead of showing zeros that look like a quiet day.
 */
export async function getDashboardSnapshot(): Promise<DashboardSnapshot | null> {
  const now = new Date();
  if (!isSupabaseConfigured()) return demoSnapshot(now);

  try {
    const supabase = await createClient();
    const [vehicleResult, rentalResult] = await Promise.all([
      supabase.from("vehicles").select("status"),
      supabase
        .from("rentals")
        .select(
          "id, reference_number, status, start_at, expected_return_at, created_at, customers ( full_name ), vehicles ( plate_number, name )",
        )
        .in("status", [...OPEN_STATUSES])
        .order("start_at", { ascending: true })
        .limit(1000),
    ]);
    if (vehicleResult.error) throw vehicleResult.error;
    if (rentalResult.error) throw rentalResult.error;

    const rentals = ((rentalResult.data ?? []) as unknown as OpenRentalRow[]).map(
      (row): DashboardRental => {
        const vehicle = one(row.vehicles);
        return {
          id: row.id,
          reference: row.reference_number,
          customerName: one(row.customers)?.full_name ?? "—",
          vehiclePlate: vehicle?.plate_number ?? "—",
          vehicleName: vehicle?.name ?? "",
          status: deriveStatus(row.status, row.expected_return_at, now),
          source: isPublicCustomerBooking(row) ? "public_web" : "ops",
          startAt: row.start_at,
          expectedReturnAt: row.expected_return_at,
          createdAt: row.created_at,
        };
      },
    );

    return buildDashboardSnapshot({
      vehicleStatuses: (vehicleResult.data ?? []).map((v) => String(v.status)),
      rentals,
      now,
    });
  } catch (error) {
    unstable_rethrow(error);
    const detail =
      typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error);
    console.error(`Dashboard snapshot failed: ${detail}`);
    return null;
  }
}
