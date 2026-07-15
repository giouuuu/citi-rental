"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useTransition,
} from "react";

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

  return (
    <MutationContext.Provider value={value}>
      {isPending ? (
        <div
          aria-label="Saving changes"
          className="fixed inset-x-0 top-14 z-50 h-1 overflow-hidden bg-primary/15"
          role="progressbar"
        >
          <div className="h-full w-1/3 animate-pulse bg-primary" />
        </div>
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
