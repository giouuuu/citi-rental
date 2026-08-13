"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_DELAY_MS = 300;

export type DebouncedNavigation = {
  /** True while a navigation is actually in flight. Drives the progress bar. */
  isPending: boolean;
  /** True while a debounced navigation is queued but has not fired yet. */
  isDirty: boolean;
  /** Queue a navigation, replacing any already queued. */
  navigate: (href: string) => void;
  /** Navigate immediately, cancelling anything queued. */
  navigateNow: (href: string) => void;
  /** Drop a queued navigation without firing it. */
  cancel: () => void;
};

/**
 * The single navigation mechanism for filter/search/sort/paginate controls.
 *
 * Everything goes through `router.replace(..., { scroll: false })` inside a
 * transition, so the current rows stay on screen while the server re-queries
 * and `isPending` reflects a real round trip.
 *
 * Refining a list is not a destination, so it uses `replace` rather than
 * `push` — otherwise every keystroke would land in the back stack.
 */
export function useDebouncedNavigation(
  options: { delayMs?: number } = {},
): DebouncedNavigation {
  const { delayMs = DEFAULT_DELAY_MS } = options;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDirty, setIsDirty] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  // Without this a queued replace fires after the user has navigated away.
  useEffect(() => clearTimer, [clearTimer]);

  const cancel = useCallback(() => {
    clearTimer();
    setIsDirty(false);
  }, [clearTimer]);

  const go = useCallback(
    (href: string) => {
      setIsDirty(false);
      startTransition(() => router.replace(href, { scroll: false }));
    },
    [router],
  );

  const navigateNow = useCallback(
    (href: string) => {
      clearTimer();
      go(href);
    },
    [clearTimer, go],
  );

  const navigate = useCallback(
    (href: string) => {
      clearTimer();
      setIsDirty(true);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        go(href);
      }, delayMs);
    },
    [clearTimer, delayMs, go],
  );

  return { isPending, isDirty, navigate, navigateNow, cancel };
}
