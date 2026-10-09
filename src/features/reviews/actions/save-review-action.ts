"use server";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";
import type { ActionResult } from "@/features/shared/types/resource";
import {
  removeReviewPhoto,
  uploadReviewPhoto,
} from "@/features/reviews/lib/upload-review-photo";
import { reviewDefinition } from "@/features/reviews/schemas/review-definition";

export async function saveReviewAction(
  formData: FormData,
): Promise<ActionResult<{ id: string; href: string }>> {
  if (!isSupabaseConfigured())
    return { success: false, message: "Connect Supabase to save reviews." };

  const text = (name: string) => {
    const raw = formData.get(name);
    return typeof raw === "string" && raw.trim() ? raw : undefined;
  };
  const parsed = reviewDefinition.schema.safeParse({
    reviewer_name: text("reviewer_name"),
    body: text("body"),
    vehicle_label: text("vehicle_label"),
    source: text("source"),
    reviewed_on: text("reviewed_on"),
    sort_order: text("sort_order"),
    is_hidden: formData.get("is_hidden") === "on",
  });
  if (!parsed.success)
    return {
      success: false,
      message: "Review the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };

  const idValue = formData.get("__id");
  const id = typeof idValue === "string" && idValue ? idValue : undefined;
  const photo = formData.get("photo");
  const photoFile = photo instanceof File && photo.size > 0 ? photo : null;
  const removePhoto = !photoFile && formData.get("photo__remove") === "on";
  const { reviewer_name, body } = parsed.data;

  // A name without words (or words without a name) reads as broken on the site.
  if (reviewer_name && !body)
    return {
      success: false,
      message: "Add what the customer wrote.",
      fieldErrors: { body: ["Paste the review, or clear the name to post a photo only."] },
    };
  if (body && !reviewer_name)
    return {
      success: false,
      message: "Add the customer's name.",
      fieldErrors: { reviewer_name: ["Add the name shown on the review."] },
    };

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

    let currentPhoto: string | null = null;
    if (id) {
      const { data: current, error } = await supabase
        .from("customer_reviews")
        .select("photo_url")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!current) throw new Error("The review was not found.");
      currentPhoto = current.photo_url;
    }

    const keepsPhoto = Boolean(photoFile || (currentPhoto && !removePhoto));
    if (!body && !keepsPhoto)
      return {
        success: false,
        message: "Add a review or a photo.",
        fieldErrors: { body: ["Paste the customer's review, or add a photo below."] },
      };

    // Cleared optional fields are saved as empty, not left as they were.
    const payload = {
      reviewer_name: reviewer_name ?? null,
      body: body ?? null,
      vehicle_label: parsed.data.vehicle_label ?? null,
      source: parsed.data.source,
      reviewed_on: parsed.data.reviewed_on ?? null,
      sort_order: parsed.data.sort_order ?? 0,
      is_hidden: parsed.data.is_hidden,
    };

    // Upload first, under the review's id, so a photo-only review is never
    // saved without its photo.
    const savedId = id ?? crypto.randomUUID();
    const photoUrl = photoFile
      ? await uploadReviewPhoto(supabase, savedId, photoFile)
      : removePhoto
        ? null
        : undefined;
    const row = photoUrl === undefined ? payload : { ...payload, photo_url: photoUrl };

    const { error: saveError } = id
      ? await supabase.from("customer_reviews").update(row).eq("id", id)
      : await supabase.from("customer_reviews").insert({ ...row, id: savedId });
    if (saveError) {
      if (photoUrl) await removeReviewPhoto(supabase, photoUrl);
      throw saveError;
    }
    if (currentPhoto && photoUrl !== undefined)
      await removeReviewPhoto(supabase, currentPhoto);

    revalidateResource(reviewDefinition.route);
    revalidateResource("/");
    return {
      success: true,
      data: { id: String(savedId), href: `${reviewDefinition.route}/${savedId}` },
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "The review could not be saved.",
    };
  }
}
