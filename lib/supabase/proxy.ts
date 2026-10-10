import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  isBookingNextPath,
  sanitizeNextPath,
} from "@/features/auth/lib/post-auth-redirect";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import {
  VISITOR_COOKIE,
  VISITOR_MAX_AGE,
  isTrackedPath,
} from "@/features/site-analytics/lib/site-event";
import { SEO_PAGES } from "@/features/seo/lib/seo-pages";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

const publicRoutes = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/access-disabled",
  "/auth",
  "/book",
  // Payment providers call these without a session; each handler verifies
  // its own signature.
  "/api/webhooks",
  // The public site's analytics beacon.
  "/api/events",
  // Crawlers and link previews fetch these signed out.
  "/robots.txt",
  "/sitemap.xml",
  "/opengraph-image",
  ...SEO_PAGES.map((page) => page.path),
];

// A booking belongs to its signed-in owner: guests may fill in /book, but the
// account and pay pages show one customer's bookings and take their payments.
const signedInOnlyRoutes = ["/account", "/book/pay"];

function matchesRoute(pathname: string, routes: readonly string[]) {
  return routes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function isPublicRoute(pathname: string) {
  if (matchesRoute(pathname, signedInOnlyRoutes)) {
    return false;
  }

  if (pathname === "/") {
    return true;
  }

  return matchesRoute(pathname, publicRoutes);
}

export async function updateSession(request: NextRequest) {
  const env = getSupabasePublicEnv();

  // Local demo mode keeps the UI reviewable before project credentials exist.
  if (!env) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const pathname = request.nextUrl.pathname;

  if (!data?.claims && !isPublicRoute(pathname)) {
    // Keep the query in `next` (the pay page needs its ?ref=) and off /login.
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (data?.claims && (pathname === "/login" || pathname === "/register")) {
    const safeNext = sanitizeNextPath(request.nextUrl.searchParams.get("next"));

    if (isBookingNextPath(safeNext)) {
      return NextResponse.redirect(new URL(safeNext!, request.url));
    }

    let role: string | null = null;
    const userId = data.claims.sub;
    if (typeof userId === "string") {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
      role = profile?.role ?? null;
    }

    // A signed JWT with no profile is a deleted user or a half-finished
    // signup. Bouncing it to "/" would lock the person out of login and
    // register, so drop the stale session and let the page render.
    if (role == null) {
      await supabase.auth.signOut({ scope: "local" });
      return response;
    }

    const destination = isAdminRole(role)
      ? (safeNext ?? "/dashboard")
      : safeNext && safeNext !== "/dashboard"
        ? safeNext
        : "/";

    return NextResponse.redirect(new URL(destination, request.url));
  }

  // Issue the analytics visitor id with the first page, so the page view and
  // a quick car click right after it count as one visitor.
  if (isTrackedPath(pathname) && !request.cookies.has(VISITOR_COOKIE)) {
    response.cookies.set(VISITOR_COOKIE, crypto.randomUUID(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: VISITOR_MAX_AGE,
    });
  }

  return response;
}
