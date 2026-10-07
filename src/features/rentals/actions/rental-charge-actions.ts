"use server";

import { z } from "zod";

import { isAdminRole, isStaffRole } from "@/features/shared/lib/app-roles";
import { parseManilaDateTimeInput } from "@/features/shared/lib/manila-time";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";
import type { ActionResult } from "@/features/shared/types/resource";
import { mapRentalDbError } from "@/features/rentals/lib/booking-gates";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

async function signedInRole() {
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
  return { supabase, role: profile.role as string };
}

function firstFieldError(error: z.ZodError) {
  const fieldErrors = error.flatten().fieldErrors as Record<string, string[]>;
  return {
    success: false as const,
    message: Object.values(fieldErrors).flat()[0] ?? "Review the highlighted fields.",
    fieldErrors,
  };
}

function dbMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "").trim();
    if (message) return message;
  }
  return fallback;
}

const addChargeSchema = z.object({
  rentalId: z.uuid("Select a rental."),
  chargeTypeId: z.uuid("Choose a charge type."),
  amount: z.coerce.number().positive("Amount must be greater than zero."),
  notes: z.string().trim().max(500, "Keep the note under 500 characters.").optional(),
});

export type AddRentalChargeInput = z.input<typeof addChargeSchema>;

export async function addRentalChargeAction(
  input: AddRentalChargeInput,
): Promise<ActionResult<{ paymentId: string }>> {
  if (!isSupabaseConfigured())
    return { success: false, message: "Connect Supabase to add charges." };

  const parsed = addChargeSchema.safeParse(input);
  if (!parsed.success) return firstFieldError(parsed.error);

  try {
    const { supabase, role } = await signedInRole();
    if (!isStaffRole(role)) throw new Error("Your role cannot add charges.");

    const { data, error } = await supabase.rpc("add_rental_charge", {
      p_rental_id: parsed.data.rentalId,
      p_charge_type_id: parsed.data.chargeTypeId,
      p_amount: parsed.data.amount,
      p_notes: parsed.data.notes || null,
    });
    if (error) throw error;

    revalidateResource("/rentals");
    return { success: true, data: { paymentId: String(data) } };
  } catch (error) {
    return { success: false, message: dbMessage(error, "The charge could not be added.") };
  }
}

const adjustBillSchema = z.object({
  rentalId: z.uuid("Select a rental."),
  direction: z.enum(["add", "subtract"]),
  amount: z.coerce.number().positive("Enter the amount to add or take off."),
  reason: z
    .string()
    .trim()
    .min(3, "Say why the bill is changing.")
    .max(500, "Keep the reason under 500 characters."),
});

export type AdjustRentalBillInput = z.input<typeof adjustBillSchema>;

export async function adjustRentalBillAction(
  input: AdjustRentalBillInput,
): Promise<ActionResult<{ paymentId: string }>> {
  if (!isSupabaseConfigured())
    return { success: false, message: "Connect Supabase to adjust bills." };

  const parsed = adjustBillSchema.safeParse(input);
  if (!parsed.success) return firstFieldError(parsed.error);

  try {
    const { supabase, role } = await signedInRole();
    if (!isAdminRole(role))
      throw new Error("Only owners and admins can adjust a bill.");

    const { amount, direction } = parsed.data;
    const { data, error } = await supabase.rpc("add_bill_adjustment", {
      p_rental_id: parsed.data.rentalId,
      p_amount: direction === "subtract" ? -amount : amount,
      p_reason: parsed.data.reason,
    });
    if (error) throw error;

    revalidateResource("/rentals");
    return { success: true, data: { paymentId: String(data) } };
  } catch (error) {
    return { success: false, message: dbMessage(error, "The bill could not be adjusted.") };
  }
}

export async function voidRentalChargeAction(
  paymentId: string,
): Promise<ActionResult> {
  if (!isSupabaseConfigured())
    return { success: false, message: "Connect Supabase to remove charges." };
  if (!z.uuid().safeParse(paymentId).success)
    return { success: false, message: "That charge was not found." };

  try {
    const { supabase, role } = await signedInRole();
    if (!isAdminRole(role))
      throw new Error("Only owners and admins can remove charges.");

    const { error } = await supabase.rpc("void_rental_charge", {
      p_payment_id: paymentId,
    });
    if (error) throw error;

    revalidateResource("/rentals");
    return { success: true };
  } catch (error) {
    return { success: false, message: dbMessage(error, "The charge could not be removed.") };
  }
}

const extendSchema = z.object({
  rentalId: z.uuid("Select a rental."),
  newReturnAt: z.string().min(1, "Choose the new return date and time."),
  chargeAmount: z.coerce
    .number()
    .min(0, "The extension charge cannot be negative.")
    .optional(),
  notes: z.string().trim().max(500, "Keep the note under 500 characters.").optional(),
});

export type ExtendRentalInput = z.input<typeof extendSchema>;

export async function extendRentalAction(
  input: ExtendRentalInput,
): Promise<ActionResult> {
  if (!isSupabaseConfigured())
    return { success: false, message: "Connect Supabase to extend rentals." };

  const parsed = extendSchema.safeParse(input);
  if (!parsed.success) return firstFieldError(parsed.error);

  const newReturnAt = parseManilaDateTimeInput(parsed.data.newReturnAt);
  if (!newReturnAt)
    return {
      success: false,
      message: "Choose the new return date and time.",
      fieldErrors: { newReturnAt: ["Choose the new return date and time."] },
    };

  try {
    const { supabase, role } = await signedInRole();
    if (!isStaffRole(role)) throw new Error("Your role cannot extend rentals.");

    const { error } = await supabase.rpc("extend_rental", {
      p_rental_id: parsed.data.rentalId,
      p_new_return_at: newReturnAt.toISOString(),
      p_charge_amount: parsed.data.chargeAmount ?? null,
      p_notes: parsed.data.notes || null,
    });
    if (error) throw error;

    revalidateResource("/rentals");
    return { success: true };
  } catch (error) {
    return { success: false, message: mapRentalDbError(error) };
  }
}
