import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";

export function RegisterVerificationNotice({
  message,
  onUseDifferentEmail,
}: {
  message: string;
  onUseDifferentEmail: () => void;
}) {
  return (
    <div className="space-y-6 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-surface text-success">
        <CheckCircle2 className="size-6" />
      </span>
      <div>
        <h1 className="font-display text-[2rem] leading-tight font-semibold tracking-[-0.03em] text-brand-950 sm:text-4xl">Confirm your email</h1>
        <p className="mt-2 leading-7 text-muted-foreground">{message}</p>
      </div>
      <Button asChild className="h-12 w-full rounded-xl text-base active:scale-[0.99]" size="lg">
        <Link href="/login">Return to sign in</Link>
      </Button>
      <Button
        className="w-full"
        onClick={onUseDifferentEmail}
        type="button"
        variant="link"
      >
        Use a different email
      </Button>
    </div>
  );
}
