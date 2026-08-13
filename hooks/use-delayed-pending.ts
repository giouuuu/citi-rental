"use client";

import { useEffect, useRef, useState } from "react";

const SHOW_AFTER_MS = 120;
const MIN_VISIBLE_MS = 320;

/**
 * Smooths a pending flag for display.
 *
 * Fast responses never show an indicator at all (a bar that appears and
 * vanishes in 80ms reads as a glitch), and once shown it stays long enough to
 * be legible instead of strobing when responses land just over the threshold.
 */
export function useDelayedPending(
  pending: boolean,
  options: { delayMs?: number; minVisibleMs?: number } = {},
): boolean {
  const { delayMs = SHOW_AFTER_MS, minVisibleMs = MIN_VISIBLE_MS } = options;
  const [visible, setVisible] = useState(false);
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (pending) {
      if (visible) return;
      const timer = setTimeout(() => {
        shownAtRef.current = Date.now();
        setVisible(true);
      }, delayMs);
      return () => clearTimeout(timer);
    }

    if (!visible) return;
    const shownAt = shownAtRef.current ?? Date.now();
    const remaining = minVisibleMs - (Date.now() - shownAt);
    if (remaining <= 0) {
      shownAtRef.current = null;
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => {
      shownAtRef.current = null;
      setVisible(false);
    }, remaining);
    return () => clearTimeout(timer);
  }, [delayMs, minVisibleMs, pending, visible]);

  return visible;
}
