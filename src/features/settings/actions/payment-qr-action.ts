"use server";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";
import type { ActionResult } from "@/features/shared/types/resource";
import {
  VEHICLE_PHOTOS_BUCKET,
  vehiclePhotoPathFromUrl,
} from "@/features/vehicles/lib/upload-vehicle-photo";

const MAX_BYTES = 5 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

// The QR is a public image like the car photos, so it shares their public,
// owner/admin-writable bucket under its own folder.
const QR_FOLDER = "company";

async function adminCompany() {
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
    throw new Error("Only owners or admins can change the payment QR.");
  }

  const { data: company } = await supabase
    .from("company_profile")
    .select("id, payment_qr_url")
    .single();
  if (!company) throw new Error("Company profile is missing.");
  return { supabase, company };
}

/** Point the booking pay page at a new QR (or none), then drop the old file. */
async function replaceQr(
  supabase: Awaited<ReturnType<typeof createClient>>,
  company: { id: string; payment_qr_url: string | null },
  url: string | null,
) {
  const { error } = await supabase
    .from("company_profile")
    .update({ payment_qr_url: url })
    .eq("id", company.id);
  if (error) throw error;

  // Best-effort: the profile no longer points at it, so a failure only orphans a file.
  const oldPath = vehiclePhotoPathFromUrl(company.payment_qr_url);
  if (oldPath?.startsWith(`${QR_FOLDER}/`)) {
    await supabase.storage.from(VEHICLE_PHOTOS_BUCKET).remove([oldPath]);
  }
  revalidateResource("/settings");
}

export async function uploadPaymentQrAction(formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: "Connect Supabase to upload the payment QR." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) {
    return { success: false, message: "Choose the QR image to upload." };
  }
  const extension = EXTENSIONS[file.type];
  if (!extension) {
    return { success: false, message: "Use a JPEG, PNG, WebP, or GIF image." };
  }
  if (file.size > MAX_BYTES) {
    return { success: false, message: "The QR image must be 5MB or smaller." };
  }

  try {
    const { supabase, company } = await adminCompany();
    const path = `${QR_FOLDER}/payment-qr-${Date.now()}.${extension}`;
    const { error } = await supabase.storage
      .from(VEHICLE_PHOTOS_BUCKET)
      .upload(path, file, { cacheControl: "3600", contentType: file.type, upsert: false });
    if (error) throw error;

    const { data } = supabase.storage.from(VEHICLE_PHOTOS_BUCKET).getPublicUrl(path);
    try {
      await replaceQr(supabase, company, data.publicUrl);
    } catch (error) {
      await supabase.storage.from(VEHICLE_PHOTOS_BUCKET).remove([path]);
      throw error;
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "The QR could not be uploaded.",
    };
  }
}

export async function removePaymentQrAction(): Promise<ActionResult> {
  if (!isSupabaseConfigured()) {
    return { success: false, message: "Connect Supabase to change the payment QR." };
  }
  try {
    const { supabase, company } = await adminCompany();
    await replaceQr(supabase, company, null);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "The QR could not be removed.",
    };
  }
}
