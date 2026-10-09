"use server";

import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";
import type { ActionResult } from "@/features/shared/types/resource";
import { reviewDefinition } from "@/features/reviews/schemas/review-definition";

export async function hideReviewAction(formData: FormData): Promise<ActionResult> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { success: false, message: "The review ID is missing." };

  try {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (!userId) throw new Error("Your session expired. Sign in and try again.");

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.is_active) throw new Error("Your profile is not active.");
    if (!isAdminRole(profile.role)) throw new Error("Your role cannot manage reviews.");

    const { data, error } = await supabase
      .from("customer_reviews")
      .update({ is_hidden: true })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("The review was not found.");

    revalidateResource(reviewDefinition.route);
    revalidateResource("/");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "The review could not be hidden.",
    };
  }
}
