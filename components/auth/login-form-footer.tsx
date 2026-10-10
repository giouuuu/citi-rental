import Link from "next/link";
import { ArrowRight } from "lucide-react";

const linkClassName =
  "font-medium text-teal-700 underline-offset-4 hover:underline";

export function LoginFormFooter({
  embedded,
  isBookingReturn,
}: {
  embedded: boolean;
  isBookingReturn: boolean;
}) {
  const signUpLine = isBookingReturn ? (
    <>New here? Continue with Google to create your account.</>
  ) : (
    <>
      New to Zeke Car Rentals?{" "}
      <Link className={linkClassName} href="/register">
        Create an account
      </Link>
    </>
  );

  if (embedded) {
    return (
      <p className="mt-5 text-center text-sm text-muted-foreground">
        {signUpLine}
      </p>
    );
  }

  return (
    <>
      <p className="mt-7 text-center text-sm text-muted-foreground">
        {signUpLine}
      </p>
      {isBookingReturn ? null : (
        <p className="mt-6 border-t pt-5 text-center text-xs text-muted-foreground">
          <Link
            className="inline-flex items-center gap-1 underline-offset-4 hover:text-brand-950 hover:underline"
            href="/dashboard"
          >
            Open demo workspace
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        </p>
      )}
    </>
  );
}
