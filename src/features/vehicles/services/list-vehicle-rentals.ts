import "server-only";

import { createClient } from "@/lib/supabase/server";

export type VehicleRental = {
  id: string;
  reference_number: string;
  status: string;
  start_at: string;
  expected_return_at: string;
  customer_name: string | null;
};

export async function listVehicleRentals(
  vehicleId: string,
): Promise<VehicleRental[]> {
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
    .from("rentals")
    .select(
      "id, reference_number, status, start_at, expected_return_at, customers(full_name)",
    )
    .eq("organization_id", profile.organization_id)
    .eq("vehicle_id", vehicleId)
    .in("status", ["reserved", "active", "overdue", "completed"])
    .order("start_at", { ascending: false });

  if (error) return [];

  return (data ?? []).map((r) => ({
    id: r.id,
    reference_number: r.reference_number,
    status: r.status,
    start_at: r.start_at,
    expected_return_at: r.expected_return_at,
    customer_name:
      r.customers &&
      typeof r.customers === "object" &&
      "full_name" in r.customers
        ? (r.customers as { full_name: string | null }).full_name
        : null,
  }));
}
