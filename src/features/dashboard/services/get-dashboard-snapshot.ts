import "server-only";

import { unstable_rethrow } from "next/navigation";

import { buildDashboardSnapshot } from "@/features/dashboard/lib/build-dashboard-snapshot";
import type {
  DashboardRental,
  DashboardRentalStatus,
  DashboardSnapshot,
} from "@/features/dashboard/types/dashboard";
import { isPublicCustomerBooking, isRentalOverdue } from "@/features/rentals";
import { buildDemoWorkspace, demoCollected } from "@/features/shared/lib/demo-workspace";
import { manilaDateKey, manilaDayEnd, manilaDayStart } from "@/features/shared/lib/manila-time";
import { toMoney } from "@/features/shared/lib/money";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const OPEN_STATUSES = ["draft", "reserved", "active", "overdue"] as const;

type Joined<T> = T | T[] | null;
type OpenRentalRow = {
  id: string;
  reference_number: string;
  status: string;
  payment_status: string | null;
  start_at: string;
  expected_return_at: string;
  created_at: string;
  pickup_location: string | null;
  return_location: string | null;
  vehicle_id: string;
  bill_balance: number | string | null;
  customers: Joined<{ full_name: string | null; phone_number: string | null }>;
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

/** Money in for the day, the way the bill counts it: refunds subtract, charges don't. */
function collected(payments: { payment_type: string; amount: number | string }[]) {
  return payments.reduce((total, payment) => {
    const amount = toMoney(payment.amount);
    if (payment.payment_type === "refund") return total - amount;
    if (payment.payment_type === "penalty") return total;
    return total + amount;
  }, 0);
}

function demoSnapshot(now: Date): DashboardSnapshot {
  const workspace = buildDemoWorkspace(now);
  const customers = new Map(workspace.customers.map((c) => [c.id, c]));
  const vehicles = new Map(workspace.vehicles.map((v) => [v.id, v]));
  const todayKey = manilaDateKey(now);
  const isToday = (value: string | null) => !!value && manilaDateKey(new Date(value)) === todayKey;
  const paid = (rentalId: string) =>
    demoCollected(workspace.payments.filter((payment) => payment.rentalId === rentalId));

  const rentals: DashboardRental[] = workspace.rentals
    .filter((r) => (OPEN_STATUSES as readonly string[]).includes(r.status))
    .map((r) => {
      const customer = customers.get(r.customerId);
      const vehicle = vehicles.get(r.vehicleId);
      return {
        id: r.id,
        reference: r.referenceNumber,
        customerName: customer?.fullName ?? "—",
        customerPhone: customer?.phoneNumber ?? null,
        vehicleId: r.vehicleId,
        vehiclePlate: vehicle?.plateNumber ?? "—",
        vehicleName: vehicle?.name ?? "",
        status: deriveStatus(r.status, r.expectedReturnAt, now),
        source: r.bookingSource,
        paymentStatus: r.status === "draft" ? "unpaid" : "deposit_paid",
        startAt: r.startAt,
        expectedReturnAt: r.expectedReturnAt,
        createdAt: r.createdAt,
        pickupLocation: r.pickupLocation,
        returnLocation: null,
        balance: Math.max(0, r.quotedTotal - paid(r.id)),
      };
    });

  return buildDashboardSnapshot({
    vehicles: workspace.vehicles.map((v) => ({
      id: v.id,
      plateNumber: v.plateNumber,
      name: v.name,
      status: v.status,
    })),
    rentals,
    returnedToday: workspace.rentals.filter((r) => r.status === "completed" && isToday(r.actualReturnAt)).length,
    collectedToday: demoCollected(workspace.payments.filter((payment) => isToday(payment.confirmedAt))),
    now,
  });
}

/**
 * Live operational picture: the fleet, every open rental, and today's
 * returns and money in, bucketed by Manila day. Returns null (and logs) on
 * failure so the dashboard can say so instead of showing zeros that look like
 * a quiet day.
 */
export async function getDashboardSnapshot(): Promise<DashboardSnapshot | null> {
  const now = new Date();
  if (!isSupabaseConfigured()) return demoSnapshot(now);

  const todayKey = manilaDateKey(now);
  const dayStart = manilaDayStart(todayKey).toISOString();
  const dayEnd = manilaDayEnd(todayKey).toISOString();

  try {
    const supabase = await createClient();
    const [vehicleResult, rentalResult, returnedResult, paymentResult] = await Promise.all([
      supabase.from("vehicles").select("id, plate_number, name, status").order("plate_number"),
      supabase
        .from("rentals")
        .select(
          "id, reference_number, status, payment_status, start_at, expected_return_at, created_at, pickup_location, return_location, vehicle_id, bill_balance, customers ( full_name, phone_number ), vehicles ( plate_number, name )",
        )
        .in("status", [...OPEN_STATUSES])
        .order("start_at", { ascending: true })
        .limit(1000),
      supabase
        .from("rentals")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed")
        .gte("actual_return_at", dayStart)
        .lt("actual_return_at", dayEnd),
      supabase
        .from("payments")
        .select("payment_type, amount")
        .eq("status", "confirmed")
        .gte("confirmed_at", dayStart)
        .lt("confirmed_at", dayEnd),
    ]);
    if (vehicleResult.error) throw vehicleResult.error;
    if (rentalResult.error) throw rentalResult.error;
    if (returnedResult.error) throw returnedResult.error;
    if (paymentResult.error) throw paymentResult.error;

    const rentals = ((rentalResult.data ?? []) as unknown as OpenRentalRow[]).map(
      (row): DashboardRental => {
        const vehicle = one(row.vehicles);
        const customer = one(row.customers);
        return {
          id: row.id,
          reference: row.reference_number,
          customerName: customer?.full_name ?? "—",
          customerPhone: customer?.phone_number ?? null,
          vehicleId: row.vehicle_id,
          vehiclePlate: vehicle?.plate_number ?? "—",
          vehicleName: vehicle?.name ?? "",
          status: deriveStatus(row.status, row.expected_return_at, now),
          source: isPublicCustomerBooking(row) ? "public_web" : "ops",
          paymentStatus: row.payment_status ?? "unpaid",
          startAt: row.start_at,
          expectedReturnAt: row.expected_return_at,
          createdAt: row.created_at,
          pickupLocation: row.pickup_location,
          returnLocation: row.return_location,
          balance: toMoney(row.bill_balance),
        };
      },
    );

    return buildDashboardSnapshot({
      vehicles: (vehicleResult.data ?? []).map((v) => ({
        id: String(v.id),
        plateNumber: String(v.plate_number ?? "—"),
        name: v.name ? String(v.name) : "",
        status: String(v.status),
      })),
      rentals,
      returnedToday: returnedResult.count ?? 0,
      collectedToday: collected(paymentResult.data ?? []),
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
