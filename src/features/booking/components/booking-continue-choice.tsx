import Link from "next/link";
import { Check, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  bookingContinuePerks,
  bookingFormPath,
  bookingSignInPath,
  type BookingContinueQuery,
} from "@/features/booking/lib/booking-continue";

type BookingContinueChoiceProps = {
  vehicleId: string;
  vehicleName: string;
  query?: BookingContinueQuery;
  compact?: boolean;
};

function PerkList({ items }: { items: readonly string[] }) {
  return (
    <ul className="mt-3 space-y-2">
      {items.map((item) => (
        <li
          className="flex gap-2 text-sm leading-5 text-muted-foreground"
          key={item}
        >
          <Check
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-teal-700"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function BookingContinueChoice({
  vehicleId,
  vehicleName,
  query = {},
  compact = false,
}: BookingContinueChoiceProps) {
  const guestHref = bookingFormPath(vehicleId, query);
  const signInHref = bookingSignInPath(vehicleId, query);

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      {!compact ? (
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-teal-700 uppercase">
            Before you reserve
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-brand-950 sm:text-3xl">
            How do you want to continue?
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            You are booking{" "}
            <span className="font-medium text-foreground">{vehicleName}</span>.
            Sign in for trip tracking, or continue as a guest — same reservation
            process either way.
          </p>
        </div>
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">
          Reserving{" "}
          <span className="font-medium text-foreground">{vehicleName}</span>.
          Choose how you want to continue.
        </p>
      )}

      <div className="flex flex-col gap-4">
        <section className="rounded-xl border border-border bg-background p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <UserRound aria-hidden="true" className="size-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-brand-950">Sign in</h2>
              <p className="text-sm text-muted-foreground">
                Best if you may book again or want status updates in one place.
              </p>
            </div>
          </div>
          <PerkList items={bookingContinuePerks.signedIn} />
          <Button asChild className="mt-4 w-full" size="lg" variant="outline">
            <Link href={signInHref} scroll={false}>
              Sign in to continue
            </Link>
          </Button>
        </section>

        <section className="rounded-xl border border-teal-600/30 bg-teal-50/40 p-4 sm:p-5">
          <h2 className="text-base font-bold text-brand-950">Continue as guest</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Fastest path — no password. We only need trip and pickup details.
          </p>
          <Button asChild className="mt-4 w-full" size="lg">
            {/* Hard navigation clears the parallel @modal slot */}
            <a href={guestHref}>Proceed to rent without signing in</a>
          </Button>
        </section>
      </div>
    </div>
  );
}
