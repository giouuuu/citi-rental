import type { ReactNode } from "react";
import { LockKeyhole } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FinanceTabs } from "@/features/finance";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * The books are owner-only — tighter than the owner/admin gate on the rest of
 * the ops app. RLS enforces it; this says so instead of showing empty pages.
 */
export default async function FinanceLayout({ children }: { children: ReactNode }) {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const { data: profile } = claims?.claims?.sub
      ? await supabase.from("profiles").select("role").eq("id", claims.claims.sub).maybeSingle()
      : { data: null };

    if (profile?.role !== "owner") {
      return (
        <Alert>
          <LockKeyhole />
          <AlertTitle>Finance is owner-only</AlertTitle>
          <AlertDescription>
            The books cover the whole company&apos;s finances, so only the owner can open them. Ask the owner for an
            export if you need figures.
          </AlertDescription>
        </Alert>
      );
    }
  }

  return (
    <div className="space-y-6">
      <FinanceTabs />
      {children}
    </div>
  );
}
