/**
 * Fees the owner adds to every online booking (Settings → Charge types →
 * "Add to every online booking"). A booking keeps the fees it was made with,
 * in rentals.booking_fees; their sum is inside quoted_total.
 */
export type BookingFeeLine = { name: string; amount: number };

/** The stored or published list; anything malformed is dropped. */
export function parseBookingFees(value: unknown): BookingFeeLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((line) => {
    if (!line || typeof line !== "object") return [];
    const { name, amount } = line as Record<string, unknown>;
    const value = Number(amount);
    return typeof name === "string" && name.trim() && Number.isFinite(value) && value > 0
      ? [{ name: name.trim(), amount: value }]
      : [];
  });
}

export function bookingFeesTotal(lines: BookingFeeLine[]): number {
  return Math.round(lines.reduce((sum, line) => sum + line.amount, 0) * 100) / 100;
}
