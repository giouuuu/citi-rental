import Link from "next/link";

import { ZekeMark } from "@/components/brand/zeke-mark";
import { SiteHeaderAccountMenu } from "@/components/landing/site-header-account-menu";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

async function getHeaderAccountUser() {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (typeof userId !== "string") return null;

  const [{ data: userData }, { data: profile }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
  ]);

  const user = userData.user;
  if (!user) return null;

  const meta = user.user_metadata ?? {};
  const fullName =
    (typeof profile?.full_name === "string" && profile.full_name.trim()) ||
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta.name === "string" && meta.name.trim()) ||
    user.email?.split("@")[0] ||
    "Account";

  const avatarUrl =
    (typeof meta.avatar_url === "string" && meta.avatar_url) ||
    (typeof meta.picture === "string" && meta.picture) ||
    undefined;

  return {
    fullName,
    email: user.email ?? undefined,
    avatarUrl,
    initials: initialsFromName(fullName),
  };
}

export async function SiteHeader() {
  const accountUser = await getHeaderAccountUser();

  return (
    <header className="relative z-30 border-b border-white/10">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          aria-label="Zeke Car Rentals home"
          className="flex items-center gap-3 text-white"
          href="/"
        >
          <ZekeMark className="size-10" variant="teal" />
          <span>
            <span className="block text-sm font-bold tracking-[0.16em] uppercase">
              Zeke Car Rentals
            </span>
            <span className="block text-[10px] tracking-[0.2em] text-brand-100 uppercase">
              Cebu · DTI registered
            </span>
          </span>
        </Link>

        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-8 text-sm font-medium text-brand-100 md:flex"
        >
          <Link className="transition-colors hover:text-white" href="/#fleet">
            Our cars
          </Link>
          <Link
            className="transition-colors hover:text-white"
            href="/#how-it-works"
          >
            How it works
          </Link>
          <Link className="transition-colors hover:text-white" href="/#rates">
            Rates
          </Link>
          <Link className="transition-colors hover:text-white" href="/#support">
            Support
          </Link>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {accountUser ? (
            <SiteHeaderAccountMenu user={accountUser} />
          ) : (
            <Button
              asChild
              className="border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              size="default"
              variant="outline"
            >
              <Link href="/login">Sign in</Link>
            </Button>
          )}
          <Button asChild size="default">
            <Link href="/#find-a-car">Find a car</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
