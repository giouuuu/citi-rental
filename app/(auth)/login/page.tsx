import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const nextRaw = params.next;
  const nextPath = Array.isArray(nextRaw) ? nextRaw[0] : nextRaw;

  return (
    <AuthShell>
      <LoginForm
        nextPath={nextPath}
        resetComplete={params.reset === "success"}
      />
    </AuthShell>
  );
}
