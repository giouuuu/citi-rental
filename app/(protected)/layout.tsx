import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell/app-shell";
import type { RentalNavCounts } from "@/features/rentals/lib/rental-nav-counts";
import { getRentalNavCounts } from "@/features/rentals/services/get-rental-nav-counts";
import { NOINDEX } from "@/features/seo/lib/business";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type Profile = {
  full_name: string;
  role: string;
  is_active: boolean;
};

export const metadata: Metadata = { robots: NOINDEX };

export default async function ProtectedLayout({ children }: LayoutProps<"/">) {
  const configured = isSupabaseConfigured();
  let profile: Profile | null = null;
  let companyName = "City Rentals";
  let rentalCounts: RentalNavCounts | null = null;

  if (configured) {
    const supabase = await createClient();
    const { data: claimsData } = await supabase.auth.getClaims();

    if (claimsData?.claims?.sub) {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, role, is_active")
        .eq("id", claimsData.claims.sub)
        .maybeSingle();
      profile = data as Profile | null;

      const { data: company } = await supabase
        .from("company_profile")
        .select("name")
        .maybeSingle();
      companyName = company?.name ?? companyName;
    }

    if (!profile) {
      redirect("/access-disabled?reason=profile");
    }

    if (!profile.is_active) {
      redirect("/access-disabled?reason=inactive");
    }

    if (!isAdminRole(profile.role)) {
      redirect("/access-disabled?reason=role");
    }

    rentalCounts = await getRentalNavCounts();
  }

  return (
    <AppShell
      demoMode={!configured}
      rentalCounts={rentalCounts}
      companyName={companyName}
      userName={profile?.full_name ?? "Alex Rivera"}
      userRole={profile?.role ?? "owner"}
    >
      {children}
    </AppShell>
  );
}
