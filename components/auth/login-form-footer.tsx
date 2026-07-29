import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export function LoginFormFooter({
  embedded,
  isBookingReturn,
  safeNext,
}: {
  embedded: boolean;
  isBookingReturn: boolean;
  safeNext?: string;
}) {
  if (embedded) {
    return isBookingReturn ? (
      <p className="mt-5 text-center text-sm text-muted-foreground">
        Prefer not to sign in? Close this and continue as a guest.
      </p>
    ) : (
      <p className="mt-5 text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link className="font-medium text-primary hover:underline" href="/register">
          Create an account
        </Link>
      </p>
    );
  }

  return (
    <>
      {isBookingReturn ? null : (
        <>
          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            Local review
            <div className="h-px flex-1 bg-border" />
          </div>
          <Button asChild className="w-full" variant="outline">
            <Link href="/dashboard">
              Open demo workspace <ArrowRight />
            </Link>
          </Button>
        </>
      )}
      {isBookingReturn ? (
        <p className="mt-7 text-center text-sm text-muted-foreground">
          Prefer to book without an account?{" "}
          <Link
            className="font-medium text-primary hover:underline"
            href={safeNext ?? "/"}
          >
            Continue as guest
          </Link>
        </p>
      ) : (
        <p className="mt-7 text-center text-sm text-muted-foreground">
          New to Zeke Car Rentals?{" "}
          <Link className="font-medium text-primary hover:underline" href="/register">
            Create an account
          </Link>
        </p>
      )}
      <p className="mt-8 text-center text-xs leading-5 text-muted-foreground">
        {isBookingReturn
          ? "After signing in you will return to complete your reservation."
          : "Access is limited to authorized rental operations staff."}
      </p>
    </>
  );
}
