import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { ContactChannelValues } from "@/features/settings/lib/contact-channels";

/** The owner's chat channels for the storefront. Empty when none are set. */
export async function getPublicContactChannels(): Promise<
  Partial<ContactChannelValues>
> {
  if (!isSupabaseConfigured()) return {};

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_contact_channels");

  if (error) {
    console.error("get_public_contact_channels failed", error.message);
    return {};
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | Record<keyof ContactChannelValues, string | null>
    | undefined;
  if (!row) return {};

  return Object.fromEntries(
    Object.entries(row).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}
