/**
 * One-off seed helper: uploads cover photos for seeded vehicles into
 * the vehicle-photos Storage bucket and updates photo_url.
 *
 * Usage: node --env-file=.env scripts/seed-vehicle-photos.mjs
 * Requires PERSONAL_ACCESS_TOKEN (or SUPABASE_SERVICE_ROLE_KEY) in env.
 */
import { createClient } from "@supabase/supabase-js";

const PROJECT_REF = "oyphktvlxfklfrdxknit";
const ORG_ID = "75318e52-9c72-4711-9965-d7f1085631e8";
const BUCKET = "vehicle-photos";

const vehicles = [
  {
    id: "a1000001-0000-4000-8000-000000000001",
    source:
      "https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "a1000001-0000-4000-8000-000000000002",
    source:
      "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "a1000001-0000-4000-8000-000000000003",
    source:
      "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "a1000001-0000-4000-8000-000000000004",
    source:
      "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "a1000001-0000-4000-8000-000000000005",
    source:
      "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "a1000001-0000-4000-8000-000000000006",
    source:
      "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1200&q=80",
  },
];

async function resolveServiceRoleKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
  }
  const token = process.env.PERSONAL_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "Set SUPABASE_SERVICE_ROLE_KEY or PERSONAL_ACCESS_TOKEN in .env",
    );
  }
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    throw new Error(`Failed to load API keys (${response.status})`);
  }
  const keys = await response.json();
  const service = keys.find((key) => key.name === "service_role");
  if (!service?.api_key) throw new Error("service_role key not found");
  return service.api_key;
}

async function main() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    `https://${PROJECT_REF}.supabase.co`;
  const serviceKey = await resolveServiceRoleKey();
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (const vehicle of vehicles) {
    const imageResponse = await fetch(vehicle.source);
    if (!imageResponse.ok) {
      console.error(`Skip ${vehicle.id}: download failed`);
      continue;
    }
    const bytes = Buffer.from(await imageResponse.arrayBuffer());
    const path = `${ORG_ID}/${vehicle.id}/cover.jpg`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, {
        contentType: "image/jpeg",
        upsert: true,
      });
    if (uploadError) {
      console.error(`Upload failed for ${vehicle.id}:`, uploadError.message);
      continue;
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const { error: updateError } = await supabase
      .from("vehicles")
      .update({ photo_url: data.publicUrl })
      .eq("id", vehicle.id)
      .eq("organization_id", ORG_ID);
    if (updateError) {
      console.error(`Update failed for ${vehicle.id}:`, updateError.message);
      continue;
    }
    console.log(`Seeded photo for ${vehicle.id}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
