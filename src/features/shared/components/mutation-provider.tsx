"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useTransition,
} from "react";

import { Progress } from "@/components/ui/progress";
import { useDelayedPending } from "@/hooks/use-delayed-pending";

type MutationContextValue = {
  isPending: boolean;
  runMutation: (operation: () => Promise<void>) => void;
};

const MutationContext = createContext<MutationContextValue | null>(null);

export function MutationProvider({ children }: { children: React.ReactNode }) {
  const [isPending, startTransition] = useTransition();
  const runMutation = useCallback((operation: () => Promise<void>) => {
    startTransition(async () => operation());
  }, []);
  const value = useMemo(
    () => ({ isPending, runMutation }),
    [isPending, runMutation],
  );
  // Writes get the viewport-level bar; a table re-query gets its own bar above
  // the rows. Same primitive, different position, so the two never read as the
  // same event.
  const showBar = useDelayedPending(isPending);

  return (
    <MutationContext.Provider value={value}>
      {showBar ? (
        <Progress
          aria-label="Saving changes"
          className="fixed inset-x-0 top-14 z-50 h-1 rounded-none bg-primary/15"
        />
      ) : null}
      <div aria-busy={isPending}>{children}</div>
    </MutationContext.Provider>
  );
}

export function useMutationCoordinator() {
  const context = useContext(MutationContext);
  if (!context)
    throw new Error(
      "useMutationCoordinator must be used inside MutationProvider.",
    );
  return context;
}
