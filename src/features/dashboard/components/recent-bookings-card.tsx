import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardSnapshot } from "@/features/dashboard/types/dashboard";
import { RentalListItem } from "@/features/dashboard/components/rental-list-item";
import { formatManila } from "@/features/shared/lib/manila-time";

export function RecentBookingsCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  return (
    <Card className="xl:col-span-4">
      <CardHeader>
        <CardTitle>Latest bookings</CardTitle>
        <CardDescription>Newest open reservations, from the website and the front desk.</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {snapshot.recentBookings.length ? (
          <ul className="divide-y border-y">
            {snapshot.recentBookings.map((rental) => (
              <RentalListItem
                detail={`${rental.source === "public_web" ? "Website" : "Front desk"} · booked ${formatManila(rental.createdAt)}`}
                key={rental.id}
                rental={rental}
              />
            ))}
          </ul>
        ) : (
          <p className="px-6 text-sm text-muted-foreground">No open bookings yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
