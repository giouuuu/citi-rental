/**
 * Charges added to every online booking of a car in its driving mode
 * (Fleet → vehicle → Booking charges). A booking keeps the fees it was made
 * with, in rentals.booking_fees; their sum is inside quoted_total.
 */
export type BookingFeeLine = {
  name: string;
  amount: number;
  /** The charge type behind the fee, when stored; staff record its cost by it. */
  chargeTypeId?: string;
};

/** The stored or published list; anything malformed is dropped. */
export function parseBookingFees(value: unknown): BookingFeeLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((line) => {
    if (!line || typeof line !== "object") return [];
    const { name, amount, charge_type_id } = line as Record<string, unknown>;
    const value = Number(amount);
    if (typeof name !== "string" || !name.trim() || !Number.isFinite(value) || value <= 0) return [];
    return [
      {
        name: name.trim(),
        amount: value,
        ...(typeof charge_type_id === "string" && charge_type_id ? { chargeTypeId: charge_type_id } : {}),
      },
    ];
  });
}

export function bookingFeesTotal(lines: BookingFeeLine[]): number {
  return Math.round(lines.reduce((sum, line) => sum + line.amount, 0) * 100) / 100;
}

