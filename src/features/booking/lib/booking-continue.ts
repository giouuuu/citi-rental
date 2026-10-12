export type BookingContinueQuery = {
  pickup?: string;
  start?: string;
  end?: string;
  /** `with-driver` carries the choice; self-drive is the default and omitted. */
  mode?: string;
};

export function buildBookingQueryString(query: BookingContinueQuery) {
  const params = new URLSearchParams();
  if (query.pickup) params.set("pickup", query.pickup);
  if (query.start) params.set("start", query.start);
  if (query.end) params.set("end", query.end);
  if (query.mode === "with-driver") params.set("mode", "with-driver");
  const value = params.toString();
  return value ? `?${value}` : "";
}

/** A car's booking page key: its readable slug when it has one, else its id. */
export function vehiclePageKey(vehicle: { id: string; slug?: string | null }) {
  return vehicle.slug || vehicle.id;
}

/** `vehicleKey` is the car's slug (preferred) or id; an id redirects to the slug. */
export function bookingFormPath(
  vehicleKey: string,
  query: BookingContinueQuery = {},
) {
  return `/book/${vehicleKey}${buildBookingQueryString(query)}`;
}

export function bookingSignInPath(
  vehicleId: string,
  query: BookingContinueQuery = {},
) {
  const next = bookingFormPath(vehicleId, query);
  return `/login?next=${encodeURIComponent(next)}`;
}

/** Every param of a page's query as `?a=1&b=2` (or ""), for a redirect that keeps them all. */
export function fullQueryString(
  query: Record<string, string | string[] | undefined>,
) {
  const kept = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item === "string") kept.append(name, item);
    }
  }
  const search = kept.toString();
  return search ? `?${search}` : "";
}
