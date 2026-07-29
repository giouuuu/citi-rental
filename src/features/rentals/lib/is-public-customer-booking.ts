/** Public site bookings use WEB- reference numbers from create_public_booking. */
export function isPublicCustomerBooking(rental: {
  reference_number?: string | null;
}): boolean {
  const reference = rental.reference_number?.trim() ?? "";
  return reference.toUpperCase().startsWith("WEB-");
}
