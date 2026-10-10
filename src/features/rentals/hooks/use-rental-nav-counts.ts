"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  parseRentalNavCounts,
  type RentalNavCounts,
} from "@/features/rentals/lib/rental-nav-counts";
import { createClient } from "@/lib/supabase/client";

/** Overdue and late pickups turn by the clock, not by a row changing. */
const CLOCK_REFRESH_MS = 60_000;
/** Bursts of row changes (a payment refreshes its rental) refetch once. */
const CHANGE_DEBOUNCE_MS = 400;

/**
 * Sidebar Rentals counts that stay current: refetched when a rental row
 * changes (Supabase realtime), on navigation, when the tab regains focus,
 * and every minute for the clock-driven reasons.
 */
export function useRentalNavCounts(initial: RentalNavCounts | null) {
  const [counts, setCounts] = useState(initial);
  // A server refresh of the layout hands down fresher counts.
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setCounts(initial);
  }
  const pathname = usePathname();
  const refreshRef = useRef<() => void>(() => {});
  const live = initial !== null;

  useEffect(() => {
    if (!live) return; // Demo mode or the RPC failed: nothing to keep live.

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const supabase = createClient();

    async function load() {
      const { data, error } = await supabase.rpc("rental_nav_counts");
      if (!cancelled && !error) setCounts(parseRentalNavCounts(data));
    }
    function scheduleLoad() {
      clearTimeout(timer);
      timer = setTimeout(load, CHANGE_DEBOUNCE_MS);
    }
    refreshRef.current = scheduleLoad;

    const channel = supabase
      .channel("sidebar-rental-counts")
      .on("postgres_changes", { event: "*", schema: "public", table: "rentals" }, scheduleLoad)
      .subscribe();
    const interval = setInterval(load, CLOCK_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleLoad();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [live]);

  // A write elsewhere in the app usually ends in a navigation.
  useEffect(() => {
    refreshRef.current();
  }, [pathname]);

  return counts;
}
