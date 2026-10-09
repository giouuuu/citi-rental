"use server";

import { agreementSettingsSchema } from "@/features/agreements/schemas/agreement-settings-schema";
import { uploadInspectionPhotoFromDataUrl } from "@/features/inspections/services/upload-inspection-photo";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";
import type { ActionResult } from "@/features/shared/types/resource";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Company details and the saved e-signature printed on every rental
 * agreement. A new signature is a new file: agreements already signed keep
 * pointing at the one they were signed with.
 */
export async function saveAgreementSettingsAction(
  formData: FormData,
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: "Connect Supabase to save settings." };
  }

  const parsed = agreementSettingsSchema.safeParse({
    legal_name: formData.get("legal_name") ?? "",
    business_address: formData.get("business_address") ?? "",
    contact_email: formData.get("contact_email") ?? "",
  });
  if (!parsed.success) {
    return {
      success: false,
      message: "Review the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (!userId) throw new Error("Your session expired.");

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.is_active || !isAdminRole(profile.role)) {
      throw new Error("Only owners or admins can update the rental agreement.");
    }

    const { data: company } = await supabase
      .from("company_profile")
      .select("id")
      .single();
    if (!company) throw new Error("Company profile is missing.");

    const update: Record<string, string | null> = {
      legal_name: parsed.data.legal_name,
      business_address: parsed.data.business_address,
      contact_email: parsed.data.contact_email || null,
    };

    const signature = formData.get("signature_data_url");
    if (typeof signature === "string" && signature.startsWith("data:image/")) {
      update.agreement_signature_path = await uploadInspectionPhotoFromDataUrl({
        supabase,
        rentalId: "company",
        dataUrl: signature,
        kind: "agreement-signature",
      });
    } else if (formData.get("remove_signature") === "true") {
      update.agreement_signature_path = null;
    }

    const { error } = await supabase
      .from("company_profile")
      .update(update)
      .eq("id", company.id);
    if (error) throw error;

    revalidateResource("/settings");
    revalidateResource("/rentals");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "The agreement settings could not be saved.",
    };
  }
}
