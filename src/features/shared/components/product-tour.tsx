"use client";

import { useCallback, useEffect, useRef } from "react";
import { Compass } from "lucide-react";
import type { Driver } from "driver.js";
import "driver.js/dist/driver.css";

import { Button } from "@/components/ui/button";

export type ProductTourStep = {
  /** CSS selector of the thing to point at; omit for a centred intro card. */
  element?: string;
  title: string;
  description: string;
  side?: "top" | "right" | "bottom" | "left";
};

function seenKey(tourKey: string) {
  return `tour:${tourKey}:seen`;
}

function hasSeen(tourKey: string) {
  try {
    return window.localStorage.getItem(seenKey(tourKey)) === "1";
  } catch {
    return true; // No storage (private mode, previews): never auto-start.
  }
}

function markSeen(tourKey: string) {
  try {
    window.localStorage.setItem(seenKey(tourKey), "1");
  } catch {
    // Storage blocked; the tour simply shows again next time.
  }
}

/**
 * A step-by-step walkthrough of one screen. Starts by itself the first time a
 * viewer opens the screen (remembered per browser), and the button replays it.
 * Steps whose element is not on the page right now are skipped.
 */
export function ProductTour({
  tourKey,
  steps,
  autoStart = true,
  label = "Take the tour",
  size = "default",
}: {
  tourKey: string;
  steps: ProductTourStep[];
  autoStart?: boolean;
  label?: string;
  size?: "default" | "sm";
}) {
  const driverRef = useRef<Driver | null>(null);

  const start = useCallback(async () => {
    const { driver } = await import("driver.js");
    const visible = steps.filter(
      (step) => !step.element || document.querySelector(step.element),
    );
    if (visible.length === 0) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    driverRef.current?.destroy();
    const tour = driver({
      animate: !reduceMotion,
      // Smooth scrolling moves the page after the card is placed, leaving it
      // over the wrong spot on tall targets. Jump instead.
      smoothScroll: false,
      showProgress: visible.length > 1,
      progressText: "{{current}} of {{total}}",
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Got it",
      popoverClass: "app-tour",
      stagePadding: 6,
      stageRadius: 10,
      overlayOpacity: 0.55,
      onDestroyed: () => {
        markSeen(tourKey);
        driverRef.current = null;
      },
      steps: visible.map((step) => ({
        element: step.element,
        popover: {
          title: step.title,
          description: step.description,
          side: step.side,
          align: "start",
        },
      })),
    });
    driverRef.current = tour;
    tour.drive();
  }, [steps, tourKey]);

  useEffect(() => {
    if (!autoStart || hasSeen(tourKey)) return;
    // Let the screen settle (data, fonts) so the first highlight lands right.
    const timer = window.setTimeout(() => void start(), 700);
    return () => window.clearTimeout(timer);
  }, [autoStart, start, tourKey]);

  useEffect(() => () => driverRef.current?.destroy(), []);

  return (
    <Button onClick={() => void start()} size={size} type="button" variant="outline">
      <Compass />
      {label}
    </Button>
  );
}
