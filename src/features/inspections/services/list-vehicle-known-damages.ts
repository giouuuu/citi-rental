import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type {
  InspectionItemStatus,
  VehicleKnownDamage,
} from "@/features/inspections/types/inspection";

type KnownDamageRow = {
  id: string;
  vehicle_id: string;
  area_code: string;
  label: string;
  status: InspectionItemStatus;
  severity: number | null;
  notes: string | null;
  photo_path: string | null;
  source_inspection_id: string | null;
  is_resolved: boolean;
  resolved_at: string | null;
  created_at: string;
};

function mapRow(row: KnownDamageRow): VehicleKnownDamage {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    areaCode: row.area_code,
    label: row.label,
    status: row.status,
    severity: row.severity,
    notes: row.notes,
    photoPath: row.photo_path,
    sourceInspectionId: row.source_inspection_id,
    isResolved: row.is_resolved,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}

export async function listVehicleKnownDamages(
  vehicleId: string,
  options?: { includeResolved?: boolean },
): Promise<VehicleKnownDamage[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  let query = supabase
    .from("vehicle_known_damages")
    .select(
      `
      id, vehicle_id, area_code, label, status, severity, notes,
      photo_path, source_inspection_id, is_resolved, resolved_at, created_at
    `,
    )
    .eq("vehicle_id", vehicleId)
    .order("created_at", { ascending: false });

  if (!options?.includeResolved) {
    query = query.eq("is_resolved", false);
  }

  const { data, error } = await query;
  if (error) {
    console.error("listVehicleKnownDamages failed", error.message);
    return [];
  }

  return ((data ?? []) as KnownDamageRow[]).map(mapRow);
}
