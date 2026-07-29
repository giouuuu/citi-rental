import { NextResponse, type NextRequest } from "next/server";

import { resolvePostAuthPath } from "@/features/auth/lib/post-auth-redirect";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth / email-confirm callback.
 *
 * Account linking note: if a password account already exists for the same
 * Google email, Supabase may reject the Google signup unless identity linking
 * is enabled in the project. Users should sign in with the original method or
 * link identities from an authenticated session. Booking Google signup never
 * sets `provision=organization` (owner self-service stays on the email RPC path).
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const shouldProvision =
    request.nextUrl.searchParams.get("provision") === "organization";
  const requestedNext = request.nextUrl.searchParams.get("next");

  if (code && isSupabaseConfigured()) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && shouldProvision) {
      const { data: userData } = await supabase.auth.getUser();
      const metadata = userData.user?.user_metadata;
      const fullName =
        typeof metadata?.full_name === "string" ? metadata.full_name : "New User";
      const organizationName =
        typeof metadata?.organization_name === "string"
          ? metadata.organization_name
          : `${fullName} Rentals`;
      const { error: provisioningError } = await supabase.rpc(
        "complete_self_service_registration",
        {
          p_full_name: fullName,
          p_organization_name: organizationName,
        },
      );

      if (provisioningError) {
        return NextResponse.redirect(
          new URL("/access-disabled?reason=setup", request.url),
        );
      }
    }

    if (!error) {
      const nextPath = await resolvePostAuthPath(supabase, requestedNext);
      return NextResponse.redirect(new URL(nextPath, request.url));
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth_callback", request.url));
}
