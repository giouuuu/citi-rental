"use server";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { isStaffRole } from "@/features/shared/lib/app-roles";
import type { ActionResult } from "@/features/shared/types/resource";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";
import { vehicleExpenseDefinition } from "@/features/vehicle-costs/schemas/vehicle-expense-definition";
import {
  EXPENSE_RECEIPTS_BUCKET,
  uploadExpenseReceipt,
} from "@/features/vehicle-costs/lib/upload-expense-receipt";

export async function saveVehicleExpenseAction(
  formData: FormData,
): Promise<ActionResult<{ id: string; href: string }>> {
  if (!isSupabaseConfigured())
    return {
      success: false,
      message: "Connect Supabase to record vehicle expenses.",
    };

  const values = Object.fromEntries(
    vehicleExpenseDefinition.fields.map((field) => {
      const raw = formData.get(field.name);
      if (field.type === "checkbox") return [field.name, raw === "on"];
      return [field.name, raw === null || raw === "" ? undefined : raw];
    }),
  );

  const parsed = vehicleExpenseDefinition.schema.safeParse(values);
  if (!parsed.success)
    return {
      success: false,
      message: "Review the highlighted expense fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };

  const receipt = formData.get("receipt");
  const receiptFile =
    receipt instanceof File && receipt.size > 0 ? receipt : null;

  try {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (!userId) throw new Error("Your session expired. Sign in and try again.");

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id, role, is_active")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.is_active)
      throw new Error("Your profile is not active for this organization.");
    if (!isStaffRole(profile.role))
      throw new Error("Your role cannot record expenses.");

    const idValue = formData.get("__id");
    const id = typeof idValue === "string" && idValue ? idValue : undefined;
    const payload = Object.fromEntries(
      Object.entries(parsed.data).filter(([, value]) => value !== undefined),
    );

    let savedId: string;
    let previousReceiptPath: string | null = null;

    if (id) {
      const { data, error } = await supabase
        .from("vehicle_expenses")
        .update(payload)
        .eq("id", id)
        .eq("organization_id", profile.organization_id)
        .select("id, receipt_path")
        .maybeSingle();
      if (error) throw error;
      if (!data)
        throw new Error("The expense was not found in your organization.");
      savedId = id;
      previousReceiptPath = data.receipt_path;
    } else {
      const { data, error } = await supabase
        .from("vehicle_expenses")
        .insert({ ...payload, organization_id: profile.organization_id })
        .select("id")
        .single();
      if (error) throw error;
      savedId = String(data.id);
    }

    if (receiptFile) {
      const path = await uploadExpenseReceipt({
        supabase,
        organizationId: profile.organization_id,
        vehicleId: String(parsed.data.vehicle_id),
        file: receiptFile,
      });
      const { error: receiptError } = await supabase
        .from("vehicle_expenses")
        .update({ receipt_path: path })
        .eq("id", savedId)
        .eq("organization_id", profile.organization_id);
      if (receiptError) throw receiptError;

      // Best-effort cleanup of the replaced receipt; the row already points
      // at the new object, so a failure here only leaves an orphan file.
      if (previousReceiptPath && previousReceiptPath !== path) {
        await supabase.storage
          .from(EXPENSE_RECEIPTS_BUCKET)
          .remove([previousReceiptPath]);
      }
    }

    revalidateResource("/expenses");
    revalidateResource("/vehicles");
    return {
      success: true,
      data: {
        id: savedId,
        href: `${vehicleExpenseDefinition.route}/${savedId}`,
      },
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "The expense could not be saved.",
    };
  }
}
