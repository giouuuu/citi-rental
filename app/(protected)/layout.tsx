import { AppShell } from "@/components/app-shell/app-shell";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type Profile = {
  full_name: string;
  role: string;
  is_active: boolean;
  organizations: { name: string } | null;
};

export default async function ProtectedLayout({ children }: LayoutProps<"/">) {
  const configured = isSupabaseConfigured();
  let profile: Profile | null = null;

  if (configured) {
    const supabase = await createClient();
    const { data: claimsData } = await supabase.auth.getClaims();

    if (claimsData?.claims?.sub) {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, role, is_active, organizations(name)")
        .eq("id", claimsData.claims.sub)
        .maybeSingle();
      profile = data as Profile | null;
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
  }

  return (
    <AppShell
      demoMode={!configured}
      organizationName={profile?.organizations?.name ?? "Northline Rentals"}
      userName={profile?.full_name ?? "Alex Rivera"}
      userRole={profile?.role ?? "owner"}
    >
      {children}
    </AppShell>
  );
}
