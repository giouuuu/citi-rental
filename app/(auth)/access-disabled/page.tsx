import type { Metadata } from "next";
import { LockKeyhole, LogOut } from "lucide-react";

import { logoutAction } from "@/app/(auth)/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Access unavailable" };

export default async function AccessDisabledPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const missingProfile = params.reason === "profile";
  const setupFailed = params.reason === "setup";
  const wrongRole = params.reason === "role";

  return (
    <AuthShell>
      <div className="text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-danger-surface text-destructive">
          <LockKeyhole className="size-6" />
        </div>
        <h1 className="mt-6 font-display text-[2rem] leading-tight font-semibold tracking-[-0.03em] text-brand-950 sm:text-4xl">
          Access unavailable
        </h1>
        <p className="mt-3 leading-7 text-muted-foreground">
          {setupFailed
            ? "Your account was created, but the organization workspace could not be initialized. Sign out and contact support before trying again."
            : missingProfile
              ? "Your account has not been assigned to an active organization profile."
              : wrongRole
                ? "This workspace is limited to owner and admin roles. Sign out or use an account with ops access."
                : "Your staff profile is disabled and cannot access fleet or rental information."}
        </p>
        <form action={logoutAction} className="mt-8">
          <Button className="h-12 w-full rounded-xl text-base active:scale-[0.99]" size="lg" type="submit" variant="outline">
            <LogOut /> Sign out
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}
