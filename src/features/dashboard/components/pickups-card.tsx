import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardSnapshot } from "@/features/dashboard/types/dashboard";
import { RentalListItem } from "@/features/dashboard/components/rental-list-item";
import { formatManila } from "@/features/shared/lib/manila-time";

export function PickupsCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  const rentals = [...snapshot.pickupsToday, ...snapshot.upcomingPickups];
  return (
    <Card className="xl:col-span-5">
      <CardHeader>
        <CardTitle>Pickups this week</CardTitle>
        <CardDescription>
          {snapshot.pickupsToday.length} today · {snapshot.upcomingPickups.length} in the next 6 days
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {rentals.length ? (
          <ul className="divide-y border-y">
            {rentals.map((rental) => (
              <RentalListItem
                detail={`Pickup ${formatManila(rental.startAt)} · back ${formatManila(rental.expectedReturnAt)}`}
                key={rental.id}
                rental={rental}
              />
            ))}
          </ul>
        ) : (
          <p className="px-6 text-sm text-muted-foreground">No pickups booked for the next 7 days.</p>
        )}
      </CardContent>
    </Card>
  );
}
