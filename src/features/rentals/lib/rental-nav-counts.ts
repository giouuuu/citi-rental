/** The sidebar's Rentals counts (public.rental_nav_counts). */
export type RentalNavCounts = {
  /** Cars out right now: active and overdue rentals. */
  active: number;
  /** Rentals on the /rentals "Needs attention" list. */
  needsAction: number;
};

/** Reads the RPC's jsonb; anything unexpected counts as zero. */
export function parseRentalNavCounts(data: unknown): RentalNavCounts {
  const record = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const count = (value: unknown) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
  };
  return { active: count(record.active), needsAction: count(record.needs_action) };
}
