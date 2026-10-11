/** The rental statuses in the order a booking moves through them. */
export const RENTAL_STATUSES = [
  "draft",
  "reserved",
  "active",
  "overdue",
  "completed",
  "cancelled",
] as const;

export type RentalStatus = (typeof RENTAL_STATUSES)[number];

export type RentalStatusCounts = Record<RentalStatus, number>;

export const RENTAL_STATUS_LABELS: Record<RentalStatus, string> = {
  draft: "Draft",
  reserved: "Reserved",
  active: "Released",
  overdue: "Overdue",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** A rental status as the UI names it (`active` → "Released"); the stored value is unchanged. */
export function rentalStatusLabel(status: string): string {
  return (
    RENTAL_STATUS_LABELS[status as RentalStatus] ??
    status.charAt(0).toUpperCase() + status.slice(1).replaceAll("_", " ")
  );
}

/** What each count means, in the words the owner acts on. */
export const RENTAL_STATUS_NOTES: Record<RentalStatus, string> = {
  draft: "Not yet confirmed",
  reserved: "Waiting for pickup",
  active: "Out on the road",
  overdue: "Past the return time",
  completed: "Returned",
  cancelled: "Called off",
};
