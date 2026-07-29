import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { PublicFleetVehicle } from "@/features/vehicles/types/public-fleet-vehicle";

type PublicFleetVehicleRow = {
  id: string;
  name: string;
  make: string;
  model: string;
  year: number;
  category: string | null;
  transmission: PublicFleetVehicle["transmission"];
  fuel_type: PublicFleetVehicle["fuel_type"];
  seating_capacity: number | null;
  photo_url: string | null;
  daily_rate: number | string;
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function asDateOnly(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (DATE_ONLY.test(trimmed)) return trimmed;
  const date = new Date(trimmed);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export type ListPublicAvailableVehiclesOptions = {
  startDate?: string | null;
  endDate?: string | null;
};

export async function listPublicAvailableVehicles(
  options: ListPublicAvailableVehiclesOptions = {},
): Promise<PublicFleetVehicle[]> {
  if (!isSupabaseConfigured()) return [];

  const startDate = asDateOnly(options.startDate);
  const endDate = asDateOnly(options.endDate);
  const hasDateFilter = Boolean(startDate && endDate && endDate >= startDate);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "list_public_available_vehicles",
    hasDateFilter
      ? { p_start_date: startDate, p_end_date: endDate }
      : {},
  );

  if (error || !data) {
    console.error("list_public_available_vehicles failed", error?.message);
    return [];
  }

  return (data as PublicFleetVehicleRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    make: row.make,
    model: row.model,
    year: Number(row.year),
    category: row.category,
    transmission: row.transmission,
    fuel_type: row.fuel_type,
    seating_capacity: row.seating_capacity,
    photo_url: row.photo_url,
    daily_rate: Number(row.daily_rate),
  }));
}
