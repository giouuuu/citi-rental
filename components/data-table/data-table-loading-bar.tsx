"use client";

import { useDelayedPending } from "@/hooks/use-delayed-pending";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/**
 * A 2px indeterminate bar for in-place table refinements — search, sort, page.
 *
 * The slot is always in the DOM at a fixed height, so activating it never
 * shifts the rows below. It is aria-hidden on purpose: the state is already
 * carried by aria-busy on the table and by the polite result summary, and
 * announcing "busy" on every keystroke would be hostile.
 */
export function DataTableLoadingBar({
  className,
  pending,
}: {
  className?: string;
  pending: boolean;
}) {
  const visible = useDelayedPending(pending);

  return (
    <div aria-hidden="true" className={cn("h-0.5 w-full", className)}>
      {visible ? <Progress className="h-0.5 rounded-none bg-primary/15" /> : null}
    </div>
  );
}
