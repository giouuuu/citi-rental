import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { EXPENSE_RECEIPTS_BUCKET } from "@/features/vehicle-costs/lib/upload-expense-receipt";

export type VehicleExpense = {
  id: string;
  category: string;
  amount: number;
  incurredOn: string;
  odometerKm: number | null;
  vendor: string | null;
  reference: string | null;
  receiptUrl: string | null;
  notes: string | null;
};

type ExpenseRow = {
  id: string;
  category: string;
  amount: number | string;
  incurred_on: string;
  odometer_km: number | string | null;
  vendor: string | null;
  reference: string | null;
  receipt_path: string | null;
  notes: string | null;
};

/**
 * Ledger for one vehicle's Costs tab, newest first. Throws-free so a failure
 * here can't take the vehicle detail page down.
 */
export async function listVehicleExpenses(
  vehicleId: string,
): Promise<VehicleExpense[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return [];

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return [];

  const { data, error } = await supabase
    .from("vehicle_expenses")
    .select(
      "id, category, amount, incurred_on, odometer_km, vendor, reference, receipt_path, notes",
    )
    .eq("organization_id", profile.organization_id)
    .eq("vehicle_id", vehicleId)
    .order("incurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (error || !data) {
    console.error("listVehicleExpenses failed", error?.message);
    return [];
  }

  const rows = data as ExpenseRow[];
  return Promise.all(
    rows.map(async (row) => {
      let receiptUrl: string | null = null;
      if (row.receipt_path) {
        const { data: signed } = await supabase.storage
          .from(EXPENSE_RECEIPTS_BUCKET)
          .createSignedUrl(row.receipt_path, 60 * 30);
        receiptUrl = signed?.signedUrl ?? null;
      }
      return {
        id: row.id,
        category: row.category,
        amount: Number(row.amount),
        incurredOn: row.incurred_on,
        odometerKm: row.odometer_km == null ? null : Number(row.odometer_km),
        vendor: row.vendor,
        reference: row.reference,
        receiptUrl,
        notes: row.notes,
      } satisfies VehicleExpense;
    }),
  );
}
