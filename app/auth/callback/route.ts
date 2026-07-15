import { NextResponse, type NextRequest } from "next/server";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const shouldProvision =
    request.nextUrl.searchParams.get("provision") === "organization";
  const requestedNext = request.nextUrl.searchParams.get("next") ?? "/dashboard";
  const safeNext =
    requestedNext.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/dashboard";

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
      return NextResponse.redirect(new URL(safeNext, request.url));
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth_callback", request.url));
}
