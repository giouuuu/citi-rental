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
        <h1 className="text-3xl font-bold tracking-[-0.03em]">Confirm your email</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{message}</p>
      </div>
      <Button asChild className="w-full" size="lg">
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
