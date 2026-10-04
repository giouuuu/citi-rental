import "server-only";

import { unstable_rethrow } from "next/navigation";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { describeError } from "@/features/analytics/lib/analytics-error";
import type { FixedAsset, DepreciationMethod } from "@/features/finance/lib/depreciation";
import type { FinanceWindow } from "@/features/finance/lib/finance-period";
import type { TaxSettings } from "@/features/finance/lib/income-tax";
import {
  buildStatement,
  type FinanceStatement,
  type StatementPayload,
} from "@/features/finance/lib/statement";
import { DEFAULT_TAX_SETTINGS, taxSettingsFromRow } from "@/features/finance/lib/tax-settings";
import { toMoney } from "@/features/shared/lib/money";

export type FinanceResult<T> = { ok: true; data: T } | { ok: false; message: string };

/** Owner-facing copy for a failed finance read. */
export function financeErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : null;
  if (code === "42501") return "Financial statements are available to the owner only.";
  if (code === "PGRST202" || code === "42883" || code === "42P01" || code === "PGRST205") {
    return "Finance needs the latest database migration. Apply supabase/migrations and reload.";
  }
  return "The statement could not load. Reload the page to try again.";
}

export async function getTaxSettings(): Promise<TaxSettings> {
  if (!isSupabaseConfigured()) return DEFAULT_TAX_SETTINGS;
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("tax_settings").select("*").maybeSingle();
    return taxSettingsFromRow(data as Record<string, unknown> | null);
  } catch (error) {
    unstable_rethrow(error);
    // The fiscal calendar must still resolve before the migration lands.
    return DEFAULT_TAX_SETTINGS;
  }
}

export function fixedAssetFromRow(row: Record<string, unknown>): FixedAsset {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    vehicleId: row.vehicle_id ? String(row.vehicle_id) : null,
    vehiclePlate: row.vehicle_plate ? String(row.vehicle_plate) : null,
    acquisitionDate: String(row.acquisition_date),
    acquisitionCost: toMoney(row.acquisition_cost),
    salvageValue: toMoney(row.salvage_value),
    usefulLifeMonths: Number(row.useful_life_months),
    method: row.depreciation_method as DepreciationMethod,
    disposedOn: row.disposed_on ? String(row.disposed_on) : null,
  };
}

async function listFixedAssets(): Promise<FixedAsset[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fixed_asset_register")
    .select(
      "id, name, vehicle_id, vehicle_plate, acquisition_date, acquisition_cost, salvage_value, useful_life_months, depreciation_method, disposed_on",
    )
    .order("acquisition_date", { ascending: true })
    .limit(1000);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(fixedAssetFromRow);
}

/**
 * One consistent statement: the SQL snapshot, the asset register and the tax
 * settings, assembled by the same pure function the CSV export uses.
 */
export async function getFinanceStatement(
  window: Pick<FinanceWindow, "from" | "to">,
  settings: TaxSettings,
): Promise<FinanceResult<FinanceStatement>> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Connect Supabase to build the financial statement." };
  }
  try {
    const supabase = await createClient();
    const [{ data, error }, assets] = await Promise.all([
      supabase.rpc("finance_statement", { p_from: window.from, p_to: window.to }),
      listFixedAssets(),
    ]);
    if (error) throw error;
    return {
      ok: true,
      data: buildStatement({ payload: data as StatementPayload, assets, settings, window }),
    };
  } catch (error) {
    unstable_rethrow(error);
    console.error(`Finance statement failed: ${describeError(error)}`);
    return { ok: false, message: financeErrorMessage(error) };
  }
}
