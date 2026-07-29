export type BookingContinueQuery = {
  pickup?: string;
  start?: string;
  end?: string;
};

export function buildBookingQueryString(query: BookingContinueQuery) {
  const params = new URLSearchParams();
  if (query.pickup) params.set("pickup", query.pickup);
  if (query.start) params.set("start", query.start);
  if (query.end) params.set("end", query.end);
  const value = params.toString();
  return value ? `?${value}` : "";
}

export function bookingContinuePath(
  vehicleId: string,
  query: BookingContinueQuery = {},
) {
  return `/book/${vehicleId}/continue${buildBookingQueryString(query)}`;
}

export function bookingFormPath(
  vehicleId: string,
  query: BookingContinueQuery = {},
) {
  return `/book/${vehicleId}${buildBookingQueryString(query)}`;
}

export function bookingSignInPath(
  vehicleId: string,
  query: BookingContinueQuery = {},
) {
  const next = bookingFormPath(vehicleId, query);
  return `/login?next=${encodeURIComponent(next)}`;
}

export const bookingContinuePerks = {
  signedIn: [
    "Save contact details for faster rebooking",
    "Track reservation status after you submit",
    "Get updates when staff confirm or change the trip",
  ],
} as const;
