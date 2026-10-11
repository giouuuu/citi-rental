"use server";

import { revalidatePath } from "next/cache";

import { newAgreementTemplateVersion } from "@/features/agreements/lib/agreement-template";
import { agreementTemplateSchema } from "@/features/agreements/schemas/agreement-template-schema";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";
import type { ActionResult } from "@/features/shared/types/resource";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const LANDING_PAGES = [
  "/",
  "/car-rental-mactan-cebu-airport",
  "/car-rental-with-driver-cebu",
  "/car-rental-delivery-cebu",
];

/**
 * Save the rental agreement wording, or pass null to go back to the built-in
 * template. Every save gets a new version, recorded on the bookings and
 * agreements that use it. Agreements already signed keep their own copy.
 */
export async function saveAgreementTemplateAction(
  template: unknown,
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: "Connect Supabase to save settings." };
  }

  let update: { agreement_template: unknown; agreement_template_version: string | null };
  if (template === null) {
    update = { agreement_template: null, agreement_template_version: null };
  } else {
    const parsed = agreementTemplateSchema.safeParse(template);
    if (!parsed.success) {
      return {
        success: false,
        message: "Fill in or remove the highlighted parts.",
        fieldErrors: Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path.join("."), [issue.message]]),
        ),
      };
    }
    update = {
      agreement_template: parsed.data,
      agreement_template_version: newAgreementTemplateVersion(),
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
      throw new Error("Only owners or admins can edit the rental agreement.");
    }

    const { data: company } = await supabase
      .from("company_profile")
      .select("id")
      .single();
    if (!company) throw new Error("Company profile is missing.");

    const { error } = await supabase
      .from("company_profile")
      .update(update)
      .eq("id", company.id);
    if (error) throw error;

    revalidateResource("/settings");
    revalidateResource("/rentals");
    // The booking form shows these terms; the landing pages quote its
    // delivery fee. Page scope: layout scope on "/" drops every cached route.
    revalidateResource("/book");
    for (const page of LANDING_PAGES) revalidatePath(page);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "The agreement could not be saved.",
    };
  }
}
