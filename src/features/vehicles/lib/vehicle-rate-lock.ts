/**
 * Daily rate is locked while the vehicle has an overlapping occupancy booking.
 * Vehicle.status is operational only (available / maintenance / inactive).
 */
export function isVehicleRateLockedByBookings(
  occupancyStatuses: readonly string[],
): boolean {
  return occupancyStatuses.some((status) =>
    status === "reserved" || status === "active" || status === "overdue",
  );
}
