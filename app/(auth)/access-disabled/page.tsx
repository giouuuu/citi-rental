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
        <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-danger-surface text-destructive">
          <LockKeyhole className="size-6" />
        </div>
        <p className="mt-6 text-xs font-semibold tracking-[0.14em] text-destructive uppercase">
          Access unavailable
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em]">
          Contact your administrator
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {setupFailed
            ? "Your account was created, but the organization workspace could not be initialized. Sign out and contact support before trying again."
            : missingProfile
              ? "Your account has not been assigned to an active organization profile."
              : wrongRole
                ? "This workspace is limited to owner and admin roles. Sign out or use an account with ops access."
                : "Your staff profile is disabled and cannot access fleet or rental information."}
        </p>
        <form action={logoutAction} className="mt-8">
          <Button className="w-full" type="submit" variant="outline">
            <LogOut /> Sign out
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}
