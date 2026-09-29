import Link from "next/link";
import type { ReactNode } from "react";

import { StatusBadge } from "@/components/design-system/status-badge";
import type { DashboardRental } from "@/features/dashboard/types/dashboard";

/** One compact rental row for the dashboard's side lists. */
export function RentalListItem({ rental, detail }: { rental: DashboardRental; detail: ReactNode }) {
  return (
    <li>
      <Link
        className="flex items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/60"
        href={`/rentals/${rental.id}`}
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">
            {rental.vehiclePlate} · {rental.customerName}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>
        </span>
        <StatusBadge label={rental.status === "draft" ? "Awaiting deposit" : undefined} status={rental.status} />
      </Link>
    </li>
  );
}
