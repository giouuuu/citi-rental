import "server-only";

import {
  isAttentionReason,
  type RentalNeedingAttention,
} from "@/features/rentals/lib/attention-reasons";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

type AttentionRow = {
  id: string;
  reference_number: string;
  reason: string;
  due_at: string;
  status: string;
  payment_status: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string | null;
  vehicle_id: string;
  vehicle_plate: string;
  vehicle_name: string;
  start_at: string;
  expected_return_at: string;
  bill_total: number | string | null;
  amount_paid: number | string | null;
  bill_balance: number | string | null;
};

/**
 * Rentals someone has to act on, most pressing first. Overdue is read off
 * the clock, so the list is right even before the overdue sweep runs.
 */
export async function listRentalsNeedingAttention(): Promise<RentalNeedingAttention[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_rentals_needing_attention");
  if (error || !data) {
    if (error) console.error("list_rentals_needing_attention failed", error.message);
    return [];
  }

  return (data as AttentionRow[]).flatMap((row) =>
    isAttentionReason(row.reason)
      ? [
          {
            id: row.id,
            reference: row.reference_number,
            reason: row.reason,
            dueAt: row.due_at,
            status: row.status,
            paymentStatus: row.payment_status,
            customerId: row.customer_id,
            customerName: row.customer_name,
            customerPhone: row.customer_phone,
            vehicleId: row.vehicle_id,
            vehiclePlate: row.vehicle_plate,
            vehicleName: row.vehicle_name,
            startAt: row.start_at,
            expectedReturnAt: row.expected_return_at,
            billTotal: Number(row.bill_total ?? 0),
            amountPaid: Number(row.amount_paid ?? 0),
            billBalance: Number(row.bill_balance ?? 0),
          },
        ]
      : [],
  );
}
