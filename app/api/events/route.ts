import { z } from "zod";

import { isTrackedPath } from "@/features/site-analytics/lib/site-event";
import { recordSiteEvent } from "@/features/site-analytics/services/record-site-event";

/**
 * Beacon endpoint for the public site's tracker. `booking_submit` is not
 * accepted here: only the booking action records it, with a real rental id.
 */
const eventSchema = z.object({
  type: z.enum(["page_view", "vehicle_view", "booking_start"]),
  path: z.string().startsWith("/").max(300),
  search: z.string().max(1000).optional(),
  referrer: z.string().max(1000).optional(),
  vehicleId: z.uuid().nullable().optional(),
});

export async function POST(request: Request) {
  // Only this site's own pages post here.
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) {
    return new Response(null, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  const parsed = eventSchema.safeParse(body);
  if (!parsed.success || !isTrackedPath(parsed.data.path)) {
    return new Response(null, { status: 400 });
  }

  await recordSiteEvent(parsed.data);
  return new Response(null, { status: 204 });
}
