/** Public site bookings use WEB- reference numbers from create_public_booking. */
export function isPublicCustomerBooking(
  rental: Record<string, unknown>,
): boolean {
  const raw = rental.reference_number;
  const reference = typeof raw === "string" ? raw.trim() : "";
  return reference.toUpperCase().startsWith("WEB-");
}
