import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  isBookingNextPath,
  sanitizeNextPath,
} from "@/features/auth/lib/post-auth-redirect";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

const publicRoutes = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/access-disabled",
  "/auth",
  "/book",
  "/account",
];

function isPublicRoute(pathname: string) {
  if (pathname === "/") {
    return true;
  }

  return publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
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
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (data?.claims && (pathname === "/login" || pathname === "/register")) {
    const safeNext = sanitizeNextPath(
      request.nextUrl.searchParams.get("next"),
    );

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

    const destination = isAdminRole(role)
      ? (safeNext ?? "/dashboard")
      : safeNext && safeNext !== "/dashboard"
        ? safeNext
        : "/";

    return NextResponse.redirect(new URL(destination, request.url));
  }

  return response;
}
