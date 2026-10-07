"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import type { ActionResult } from "@/features/shared/types/resource";
import { revalidateResource } from "@/features/shared/lib/revalidate-resource";

const inputSchema = z.object({
  ids: z.array(z.uuid()).min(1, "Select at least one user.").max(100),
  change: z.union([
    z.object({ role: z.enum(["owner", "admin", "staff", "customer"]) }).strict(),
    z.object({ is_active: z.boolean() }).strict(),
  ]),
});

export type BulkUserChange = z.infer<typeof inputSchema>["change"];

/**
 * Sets one role or access flag on many profiles at once. Two guards keep an
 * admin from locking the workspace: nobody changes their own account here, and
 * only owners grant, revoke or disable owner accounts.
 */
export async function bulkUpdateUsersAction(input: {
  ids: string[];
  change: BulkUserChange;
}): Promise<ActionResult<{ count: number }>> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message ?? "The selection is invalid." };
  const { ids, change } = parsed.data;
  try {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (!userId) throw new Error("Your session expired. Sign in and try again.");
    const { data: profile } = await supabase.from("profiles").select("role, is_active").eq("id", userId).maybeSingle();
    if (!profile?.is_active || !isAdminRole(profile.role)) throw new Error("Only owners or admins can modify users.");
    if (ids.includes(userId)) throw new Error("Your own account can't be changed in bulk. Deselect it and try again.");
    if (profile.role !== "owner") {
      if ("role" in change && change.role === "owner") throw new Error("Only owners can make someone an owner.");
      const { count, error: ownerError } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .in("id", ids)
        .eq("role", "owner");
      if (ownerError) throw ownerError;
      if (count) throw new Error("Only owners can change owner accounts. Deselect them and try again.");
    }
    const { data, error } = await supabase.from("profiles").update(change).in("id", ids).select("id");
    if (error) throw error;
    if (!data?.length) throw new Error("None of the selected users were found.");
    revalidateResource("/settings/users");
    return { success: true, data: { count: data.length } };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "The users could not be updated." };
  }
}
