import "server-only";

import { unstable_rethrow } from "next/navigation";

import { CUSTOMER_RENTAL_LIMIT } from "@/features/customers/lib/summarize-customer-rentals";
import type { CustomerRental } from "@/features/customers/types/customer-rental";
import { buildDemoWorkspace } from "@/features/shared/lib/demo-workspace";
import { toMoney } from "@/features/shared/lib/money";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";


type RentalRow = {
  id: string;
  reference_number: string;
  status: string;
  start_at: string;
  expected_return_at: string;
  actual_return_at: string | null;
  quoted_total: number | string | null;
  vehicles: { plate_number: string | null; name: string | null } | { plate_number: string | null; name: string | null }[] | null;
};

type PaymentRow = { rental_id: string; payment_type: string; amount: number | string };

function tally(rentalId: string, payments: PaymentRow[]) {
  let collected = 0;
  let penalties = 0;
  for (const payment of payments) {
    if (payment.rental_id !== rentalId) continue;
    const amount = toMoney(payment.amount);
    if (payment.payment_type === "penalty") penalties += amount;
    else if (payment.payment_type === "refund") collected -= amount;
    else collected += amount;
  }
  return { collected: toMoney(collected), penalties: toMoney(penalties) };
}

function demoRentals(customerId: string): CustomerRental[] {
  const workspace = buildDemoWorkspace();
  const vehicles = new Map(workspace.vehicles.map((v) => [v.id, v]));
  return workspace.rentals
    .filter((rental) => rental.customerId === customerId)
    .sort((a, b) => b.startAt.localeCompare(a.startAt))
    .slice(0, CUSTOMER_RENTAL_LIMIT)
    .map((rental) => {
      const payments = workspace.payments
        .filter((p) => p.rentalId === rental.id)
        .map((p) => ({ rental_id: p.rentalId, payment_type: p.paymentType, amount: p.amount }));
      return {
        id: rental.id,
        reference: rental.referenceNumber,
        status: rental.status,
        vehiclePlate: vehicles.get(rental.vehicleId)?.plateNumber ?? "—",
        vehicleName: vehicles.get(rental.vehicleId)?.name ?? "",
        startAt: rental.startAt,
        expectedReturnAt: rental.expectedReturnAt,
        actualReturnAt: rental.actualReturnAt,
        quotedTotal: rental.quotedTotal,
        ...tally(rental.id, payments),
      };
    });
}

/**
 * A customer's rentals, newest first, with what each one collected and billed.
 * Degrades to an empty history (and logs) so a failed query never takes the
 * customer form down with it.
 */
export async function listCustomerRentals(customerId: string): Promise<CustomerRental[]> {
  if (!isSupabaseConfigured()) return demoRentals(customerId);

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("rentals")
      .select(
        "id, reference_number, status, start_at, expected_return_at, actual_return_at, quoted_total, vehicles ( plate_number, name )",
      )
      .eq("customer_id", customerId)
      .order("start_at", { ascending: false })
      .limit(CUSTOMER_RENTAL_LIMIT);
    if (error) throw error;

    const rows = (data ?? []) as unknown as RentalRow[];
    if (!rows.length) return [];

    const { data: paymentData, error: paymentError } = await supabase
      .from("payments")
      .select("rental_id, payment_type, amount")
      .eq("status", "confirmed")
      .in("rental_id", rows.map((row) => row.id));
    if (paymentError) throw paymentError;
    const payments = (paymentData ?? []) as PaymentRow[];

    return rows.map((row) => {
      const vehicle = Array.isArray(row.vehicles) ? row.vehicles[0] : row.vehicles;
      return {
        id: row.id,
        reference: row.reference_number,
        status: row.status,
        vehiclePlate: vehicle?.plate_number ?? "—",
        vehicleName: vehicle?.name ?? "",
        startAt: row.start_at,
        expectedReturnAt: row.expected_return_at,
        actualReturnAt: row.actual_return_at,
        quotedTotal: toMoney(row.quoted_total),
        ...tally(row.id, payments),
      };
    });
  } catch (error) {
    unstable_rethrow(error);
    const detail =
      typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error);
    console.error(`Customer rental history failed: ${detail}`);
    return [];
  }
}
