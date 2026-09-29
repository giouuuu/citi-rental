import Link from "next/link";
import { ClockAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hoursLate } from "@/features/dashboard/lib/build-dashboard-snapshot";
import type { DashboardSnapshot } from "@/features/dashboard/types/dashboard";
import { RentalListItem } from "@/features/dashboard/components/rental-list-item";
import { formatManila } from "@/features/shared/lib/manila-time";

function lateness(hours: number) {
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} late`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} late`;
}

/** Things someone should act on now: overdue cars and unpaid web bookings. */
export function AttentionCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  const items = [...snapshot.overdue, ...snapshot.awaitingDeposit.slice(0, 4)];
  const clear = items.length === 0;

  return (
    <Card className="xl:col-span-4">
      <CardHeader>
        <div className="mb-2 flex size-10 items-center justify-center rounded-md bg-gold-50 text-gold-700">
          <ClockAlert aria-hidden="true" className="size-5" />
        </div>
        <CardTitle>Needs attention</CardTitle>
        <CardDescription>
          {clear
            ? "Nothing overdue and no bookings waiting on a deposit."
            : `${snapshot.overdue.length} overdue · ${snapshot.awaitingDeposit.length} awaiting deposit`}
        </CardDescription>
      </CardHeader>
      {clear ? null : (
        <CardContent className="px-0">
          <ul className="divide-y border-y">
            {snapshot.overdue.map((rental) => (
              <RentalListItem
                detail={`Due ${formatManila(rental.expectedReturnAt)} · ${lateness(hoursLate(rental))}`}
                key={rental.id}
                rental={rental}
              />
            ))}
            {snapshot.awaitingDeposit.slice(0, 4).map((rental) => (
              <RentalListItem
                detail={`Pickup ${formatManila(rental.startAt)} · booked ${formatManila(rental.createdAt)}`}
                key={rental.id}
                rental={rental}
              />
            ))}
          </ul>
          <div className="px-4 pt-4">
            <Button asChild className="w-full" variant="secondary">
              <Link href="/rentals">Open rentals</Link>
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
