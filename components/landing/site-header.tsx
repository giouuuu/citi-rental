import Link from "next/link";
import type { CSSProperties } from "react";

import { ZekeLogo } from "@/components/brand/zeke-logo";
import { SiteHeaderAccountMenu } from "@/components/landing/site-header-account-menu";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isAdminRole } from "@/features/shared/lib/app-roles";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

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
    supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", userId)
      .maybeSingle(),
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
    canOpenOps: isAdminRole(profile?.role),
  };
}

const NAV_LINKS = [
  { href: "/#fleet", label: "Cars" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#why", label: "Why Zeke" },
  { href: "/#contact", label: "Contact" },
];

export async function SiteHeader({
  tone = "dark",
  intro = false,
}: {
  /** `light` for pages on a light surface (the landing hero); `dark` for navy banners. */
  tone?: "dark" | "light";
  /** Stagger the header items into focus as part of the landing intro. */
  intro?: boolean;
}) {
  const accountUser = await getHeaderAccountUser();
  const light = tone === "light";
  const enter = (delayMs: number) =>
    intro
      ? {
          className: "focus-in",
          style: { "--focus-delay": `${delayMs}ms` } as CSSProperties,
        }
      : { className: undefined, style: undefined };
  const navLinkClassName = cn(
    "rounded-md px-3 py-2 transition-colors",
    light
      ? "text-brand-700 hover:bg-brand-950/5 hover:text-brand-950"
      : "hover:bg-white/5 hover:text-white",
  );

  return (
    <header
      className={cn(
        "relative z-30",
        light ? "border-b border-transparent" : "border-b border-white/10",
      )}
    >
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          aria-label="Zeke Car Rentals home"
          className={cn(
            "flex items-center gap-3",
            light ? "text-brand-950" : "text-white",
            enter(250).className,
          )}
          href="/"
          style={enter(250).style}
        >
          <ZekeLogo tone={tone} />
        </Link>

        <nav
          aria-label="Primary navigation"
          className={cn(
            "hidden items-center gap-1 text-sm font-medium md:flex",
            !light && "text-brand-100",
          )}
        >
          {NAV_LINKS.map(({ href, label }, index) => (
            <Link
              className={cn(navLinkClassName, enter(330 + index * 60).className)}
              href={href}
              key={href}
              style={enter(330 + index * 60).style}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div
          className={cn("flex items-center gap-2 sm:gap-3", enter(580).className)}
          style={enter(580).style}
        >
          {accountUser ? (
            <SiteHeaderAccountMenu tone={tone} user={accountUser} />
          ) : (
            <Button
              asChild
              className={
                light
                  ? undefined
                  : "border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              }
              size="default"
              variant="outline"
            >
              <Link href="/login">Sign in</Link>
            </Button>
          )}
          <Button asChild className="hidden sm:inline-flex" size="default">
            <Link href="/#find-a-car">Find a car</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
