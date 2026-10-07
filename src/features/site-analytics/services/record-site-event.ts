import "server-only";

import { cookies, headers } from "next/headers";

import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  SOURCE_COOKIE,
  SOURCE_MAX_AGE,
  VISITOR_COOKIE,
  VISITOR_MAX_AGE,
  decodeSourceCookie,
  encodeSourceCookie,
  isUuid,
  type SiteEventType,
} from "@/features/site-analytics/lib/site-event";
import { detectTrafficSource } from "@/features/site-analytics/lib/traffic-source";
import { deviceFromUserAgent, isBotUserAgent } from "@/features/site-analytics/lib/user-agent";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type SiteEventInput = {
  type: SiteEventType;
  path: string;
  /** The page's query string, read for `?fb` / utm tags / click ids. */
  search?: string | null;
  referrer?: string | null;
  vehicleId?: string | null;
  rentalId?: string | null;
};

const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

/**
 * Records one public-site event against the visitor's cookies, creating them
 * on first sight and sliding the 30-minute session. Must run where cookies are
 * writable (a route handler or server action). Never throws: analytics must
 * not break a page or a booking.
 */
export async function recordSiteEvent(input: SiteEventInput): Promise<void> {
  try {
    if (!isSupabaseConfigured()) return;
    const admin = createAdminClient();
    if (!admin) return;

    const headerList = await headers();
    const userAgent = headerList.get("user-agent");
    if (isBotUserAgent(userAgent)) return;

    const jar = await cookies();
    const visitorId = isUuid(jar.get(VISITOR_COOKIE)?.value)
      ? jar.get(VISITOR_COOKIE)!.value
      : crypto.randomUUID();
    const sessionId = isUuid(jar.get(SESSION_COOKIE)?.value)
      ? jar.get(SESSION_COOKIE)!.value
      : crypto.randomUUID();

    const detected = detectTrafficSource({
      search: input.search ?? "",
      referrer: input.referrer,
      ownHost: headerList.get("host")?.split(":")[0] ?? null,
    });
    const remembered = decodeSourceCookie(jar.get(SOURCE_COOKIE)?.value);
    const attribution = detected ?? remembered;

    jar.set(VISITOR_COOKIE, visitorId, { ...cookieBase, maxAge: VISITOR_MAX_AGE });
    jar.set(SESSION_COOKIE, sessionId, { ...cookieBase, maxAge: SESSION_MAX_AGE });
    if (detected) {
      jar.set(SOURCE_COOKIE, encodeSourceCookie(detected.source, detected.campaign), {
        ...cookieBase,
        maxAge: SOURCE_MAX_AGE,
      });
    }

    // Ops accounts previewing the site are skipped inside the RPC.
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;

    const { error } = await admin.rpc("record_site_event", {
      p_event_type: input.type,
      p_visitor_id: visitorId,
      p_session_id: sessionId,
      p_path: input.path.slice(0, 300),
      p_source: attribution?.source ?? "direct",
      p_campaign: attribution?.campaign ?? null,
      p_referrer_host: detected?.referrerHost ?? null,
      p_device: deviceFromUserAgent(userAgent),
      p_vehicle_id: isUuid(input.vehicleId) ? input.vehicleId : null,
      p_rental_id: isUuid(input.rentalId) ? input.rentalId : null,
      p_user_id: userId,
    });
    if (error) console.error("[site-analytics] record failed:", error.message);
  } catch (error) {
    console.error("[site-analytics] record failed:", error);
  }
}
