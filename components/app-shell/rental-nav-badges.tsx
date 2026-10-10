"use client";

import { useRentalNavCounts } from "@/features/rentals/hooks/use-rental-nav-counts";
import type { RentalNavCounts } from "@/features/rentals/lib/rental-nav-counts";

/**
 * Live counts on the sidebar's Rentals item: cars out now and rentals that
 * need someone to act. Collapsed to icons, only a dot for "needs action".
 */
export function RentalNavBadges({ initial }: { initial: RentalNavCounts | null }) {
  const counts = useRentalNavCounts(initial);
  if (!counts) return null;

  const { active, needsAction } = counts;
  const summary = [
    `${active} active`,
    `${needsAction} ${needsAction === 1 ? "needs" : "need"} action`,
  ].join(", ");

  return (
    <>
      <span className="sr-only" aria-live="polite">
        Rentals: {summary}
      </span>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-2.5 right-2 flex items-center gap-1 group-data-[collapsible=icon]:hidden"
        title={summary}
      >
        {active > 0 ? (
          <span className="flex h-5 items-center rounded-md bg-sidebar-accent px-1.5 text-[11px] font-medium text-sidebar-foreground tabular-nums ring-1 ring-sidebar-border ring-inset">
            {active} active
          </span>
        ) : null}
        {needsAction > 0 ? (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-destructive px-1.5 text-[11px] font-semibold text-white tabular-nums">
            {needsAction}
          </span>
        ) : null}
      </div>
      {needsAction > 0 ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1 left-6 hidden size-2 rounded-full bg-destructive ring-2 ring-sidebar group-data-[collapsible=icon]:block"
        />
      ) : null}
    </>
  );
}
