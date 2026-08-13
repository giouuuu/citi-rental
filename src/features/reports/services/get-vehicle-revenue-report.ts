import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import {
  aggregateVehicleRevenue,
  type RevenuePayment,
  type RevenueRental,
  type VehicleRevenueRow,
} from "@/features/reports/lib/aggregate-vehicle-revenue";

export type VehicleRevenueQuery = {
  from: Date;
  to: Date;
  vehicleId?: string | null;
};

type RentalRow = {
  id: string;
  vehicle_id: string;
  start_at: string;
  expected_return_at: string;
  actual_return_at: string | null;
  quoted_total: number | string | null;
  vehicles: { name: string | null; plate_number: string | null } | null;
};

export async function getVehicleRevenueReport({
  from,
  to,
  vehicleId,
}: VehicleRevenueQuery): Promise<VehicleRevenueRow[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();

  let rentalQuery = supabase
    .from("rentals")
    .select(
      `
      id,
      vehicle_id,
      start_at,
      expected_return_at,
      actual_return_at,
      quoted_total,
      vehicles ( name, plate_number )
    `,
    )
    .neq("status", "cancelled")
    .lt("start_at", to.toISOString())
    .gte("expected_return_at", from.toISOString())
    .limit(10000);

  if (vehicleId) rentalQuery = rentalQuery.eq("vehicle_id", vehicleId);

  const { data: rentalData, error: rentalError } = await rentalQuery;
  if (rentalError) throw rentalError;

  const rentalRows = (rentalData ?? []) as unknown as RentalRow[];
  if (!rentalRows.length) return [];

  const rentals: RevenueRental[] = rentalRows.map((row) => {
    const vehicle = Array.isArray(row.vehicles) ? row.vehicles[0] : row.vehicles;
    return {
      id: row.id,
      vehicleId: row.vehicle_id,
      vehicleName: vehicle?.name ?? null,
      plateNumber: vehicle?.plate_number ?? null,
      startAt: row.start_at,
      expectedReturnAt: row.expected_return_at,
      actualReturnAt: row.actual_return_at,
      quotedTotal: row.quoted_total == null ? null : Number(row.quoted_total),
    };
  });

  const { data: paymentData, error: paymentError } = await supabase
    .from("payments")
    .select("rental_id, payment_type, amount")
    .eq("status", "confirmed")
    .in(
      "rental_id",
      rentals.map((rental) => rental.id),
    );
  if (paymentError) throw paymentError;

  const payments: RevenuePayment[] = (paymentData ?? []).map((row) => ({
    rentalId: row.rental_id as string,
    paymentType: row.payment_type as RevenuePayment["paymentType"],
    amount: Number(row.amount) || 0,
  }));

  return aggregateVehicleRevenue({ rentals, payments, from, to });
}
