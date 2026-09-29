import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAnalyticsOverview, utilizationPercent } from "@/features/analytics";
import { formatPhp } from "@/features/shared/lib/money";

/** Month-to-date money and utilization, with the way into full analytics. */
export async function MonthToDateCard({ todayKey }: { todayKey: string }) {
  const result = await getAnalyticsOverview(`${todayKey.slice(0, 7)}-01`, todayKey);
  const figures = result.ok
    ? [
        { label: "Collected", value: formatPhp(result.data.collected) },
        {
          label: "Utilization",
          value: (() => {
            const value = utilizationPercent(result.data.rentedVehicleDays, result.data.fleetVehicleDays);
            return value === null ? "—" : `${value}%`;
          })(),
        },
        { label: "Bookings", value: String(result.data.bookingsCreated) },
        { label: "Outstanding", value: formatPhp(result.data.outstandingBalance) },
      ]
    : null;

  return (
    <Card className="xl:col-span-3">
      <CardHeader>
        <CardTitle>Month to date</CardTitle>
        <CardDescription>{result.ok ? "Since the 1st, Manila time." : result.message}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {figures ? (
          <dl className="grid grid-cols-2 gap-3">
            {figures.map((figure) => (
              <div key={figure.label}>
                <dt className="text-xs text-muted-foreground">{figure.label}</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums">{figure.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <Button asChild className="w-full" variant="outline">
          <Link href="/analytics">
            Open analytics <ArrowUpRight />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
