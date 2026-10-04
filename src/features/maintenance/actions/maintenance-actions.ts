"use server";

import { z } from "zod";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { PAYMENT_METHODS } from "@/features/finance/schemas/expense-definition";
import { MAINTENANCE_DOCUMENT_TYPES } from "@/features/maintenance/lib/maintenance-options";
import { describeError } from "@/features/analytics/lib/analytics-error";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";
import { getViewerRole } from "@/features/shared/services/get-viewer-role";
import type { ActionResult } from "@/features/shared/types/resource";

const optionalWhole = (label: string, min: number, max: number) =>
  z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce
      .number({ error: `Enter ${label} as a number.` })
      .int(`Enter ${label} as a whole number.`)
      .min(min, `${label[0].toUpperCase()}${label.slice(1)} must be at least ${min.toLocaleString("en-PH")}.`)
      .max(max, `${label[0].toUpperCase()}${label.slice(1)} must be at most ${max.toLocaleString("en-PH")}.`)
      .optional(),
  );

const optionalReading = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number({ error: "Enter the reading in km." }).min(0, "Cannot be negative.").optional(),
);

const planSchema = z
  .object({
    id: z.uuid().optional(),
    vehicleId: z.uuid(),
    name: z.string().trim().min(1, "Name the service.").max(120),
    intervalKm: optionalWhole("the km interval", 100, 200_000),
    intervalMonths: optionalWhole("the month interval", 1, 120),
    baselineDoneOn: z.iso.date("Enter when it was last done."),
    baselineOdometer: optionalReading,
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((value) => value.intervalKm !== undefined || value.intervalMonths !== undefined, {
    message: "Set a km interval, a month interval, or both.",
    path: ["intervalKm"],
  })
  .refine((value) => value.intervalKm === undefined || value.baselineOdometer !== undefined, {
    message: "Enter the odometer when it was last done, so the next km can be counted.",
    path: ["baselineOdometer"],
  });

export type SaveMaintenancePlanInput = z.input<typeof planSchema>;

const recordSchema = z
  .object({
    vehicleId: z.uuid(),
    planId: z.uuid().optional(),
    title: z.string().trim().max(160).optional(),
    performedOn: z.iso.date("Enter the service date."),
    odometer: optionalReading,
    cost: z.coerce.number({ error: "Enter the cost." }).min(0, "Cannot be negative. Enter 0 for free work."),
    categoryCode: z.enum(["repairs_labor", "repairs_materials"]),
    shopName: z.string().trim().max(200).optional(),
    documentType: z.enum(MAINTENANCE_DOCUMENT_TYPES.map((type) => type.value) as [string, ...string[]]),
    documentNumber: z.string().trim().max(80).optional(),
    inputVat: z.preprocess(
      (value) => (value === "" || value === null ? 0 : value),
      z.coerce.number({ error: "Enter the VAT as a number." }).min(0, "Cannot be negative."),
    ),
    paymentMethod: z.enum(PAYMENT_METHODS.map((method) => method.value) as [string, ...string[]]).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((value) => value.planId || value.title, {
    message: "Describe the work done.",
    path: ["title"],
  })
  .refine((value) => value.documentType !== "vat_invoice" || value.cost === 0 || value.inputVat < value.cost, {
    message: "The VAT must be less than the amount paid.",
    path: ["inputVat"],
  });

export type RecordMaintenanceInput = z.input<typeof recordSchema>;

async function requireAdminClient() {
  const role = await getViewerRole();
  if (!isAdminRole(role)) throw new Error("Only owners and admins can manage maintenance.");
  return createClient();
}

/** Postgres messages from the maintenance RPCs and constraints, said in words. */
function maintenanceMessage(error: unknown, fallback: string) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  const message = describeError(error);
  if (code === "22023" || code === "P0002" || code === "42501") return message || fallback;
  if (message.includes("vehicle_maintenance_plans_one_name_per_vehicle")) {
    return "This car already has a plan with that name.";
  }
  if (message.includes("row-level security")) return "Only owners and admins can manage maintenance.";
  if (message.includes("violates check constraint")) return "One of the values is out of range. Review the fields.";
  return message || fallback;
}

function invalid(error: z.ZodError, message: string): ActionResult {
  return {
    success: false,
    message,
    fieldErrors: error.flatten().fieldErrors as Record<string, string[]>,
  };
}

/** Creates or edits one service plan on a car. */
export async function saveMaintenancePlanAction(input: SaveMaintenancePlanInput): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { success: false, message: "Connect Supabase to manage maintenance." };

  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, "Review the highlighted plan fields.");

  try {
    const supabase = await requireAdminClient();
    const value = parsed.data;
    const payload = {
      vehicle_id: value.vehicleId,
      name: value.name,
      interval_km: value.intervalKm ?? null,
      interval_months: value.intervalMonths ?? null,
      baseline_done_on: value.baselineDoneOn,
      baseline_odometer: value.baselineOdometer ?? null,
      notes: value.notes || null,
    };
    const { data, error } = value.id
      ? await supabase
          .from("vehicle_maintenance_plans")
          .update(payload)
          .eq("id", value.id)
          .eq("vehicle_id", value.vehicleId)
          .select("id")
          .maybeSingle()
      : await supabase.from("vehicle_maintenance_plans").insert(payload).select("id").single();
    if (error) throw error;
    if (!data) throw new Error("The plan was not found.");
    revalidateResource("/vehicles");
    revalidateResource("/rentals");
    return { success: true };
  } catch (error) {
    return { success: false, message: maintenanceMessage(error, "The plan could not be saved.") };
  }
}

/** Stops a schedule. Its past services stay in the car's history. */
export async function archiveMaintenancePlanAction(planId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(planId).success) return { success: false, message: "The plan ID is missing." };
  try {
    const supabase = await requireAdminClient();
    const { data, error } = await supabase
      .from("vehicle_maintenance_plans")
      .update({ is_active: false })
      .eq("id", planId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("The plan was not found.");
    revalidateResource("/vehicles");
    revalidateResource("/rentals");
    return { success: true };
  } catch (error) {
    return { success: false, message: maintenanceMessage(error, "The plan could not be stopped.") };
  }
}

/**
 * Records one service. The RPC posts its cost as a vehicle-tagged Repairs and
 * maintenance expense in the same transaction and moves the odometer forward.
 */
export async function recordMaintenanceAction(input: RecordMaintenanceInput): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { success: false, message: "Connect Supabase to record maintenance." };

  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, "Review the highlighted service fields.");

  try {
    const supabase = await requireAdminClient();
    const value = parsed.data;
    const { error } = await supabase.rpc("record_vehicle_maintenance", {
      p_vehicle_id: value.vehicleId,
      p_plan_id: value.planId ?? null,
      p_title: value.title || null,
      p_performed_on: value.performedOn,
      p_odometer: value.odometer ?? null,
      p_cost: value.cost,
      p_category_code: value.categoryCode,
      p_shop_name: value.shopName || null,
      p_document_type: value.documentType,
      p_document_number: value.documentNumber || null,
      p_input_vat: value.documentType === "vat_invoice" ? value.inputVat : 0,
      p_payment_method: value.paymentMethod ?? null,
      p_notes: value.notes || null,
    });
    if (error) throw error;
    revalidateResource("/vehicles");
    revalidateResource("/rentals");
    revalidateResource("/finance");
    return { success: true };
  } catch (error) {
    return { success: false, message: maintenanceMessage(error, "The service could not be recorded.") };
  }
}

/** Undoes a mistaken entry; its expense is voided with it. */
export async function voidMaintenanceAction(recordId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(recordId).success) return { success: false, message: "The service ID is missing." };
  try {
    const supabase = await requireAdminClient();
    const { error } = await supabase.rpc("void_vehicle_maintenance", { p_record_id: recordId });
    if (error) throw error;
    revalidateResource("/vehicles");
    revalidateResource("/rentals");
    revalidateResource("/finance");
    return { success: true };
  } catch (error) {
    return { success: false, message: maintenanceMessage(error, "The service could not be voided.") };
  }
}
