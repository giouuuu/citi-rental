import Link from "next/link";
import { CarFront, Plus } from "lucide-react";

import { StatusBadge, type StatusTone } from "@/components/design-system/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import type { DashboardSnapshot, FleetBoardCar, FleetCarState } from "@/features/dashboard/types/dashboard";
import { ExportRowsButton } from "@/features/shared/components/export-rows-button";
import { formatManila, manilaDateKey } from "@/features/shared/lib/manila-time";

const STATE: Record<FleetCarState, { label: string; tone: StatusTone }> = {
  free: { label: "Free", tone: "available" },
  out: { label: "Out", tone: "rented" },
  overdue: { label: "Overdue", tone: "overdue" },
  maintenance: { label: "Maintenance", tone: "maintenance" },
};

/** What the owner needs to know to rent the car out, or chase it back. */
function detail(car: FleetBoardCar, todayKey: string) {
  if (car.current) {
    const when = formatManila(car.current.expectedReturnAt);
    return car.state === "overdue"
      ? `Was due ${when} · ${car.current.customerName}`
      : `Back ${when} · ${car.current.customerName}`;
  }
  if (car.state === "maintenance") return "Not bookable until it's back in service";
  if (!car.next) return "Free · nothing booked ahead";
  if (new Date(car.next.startAt).getTime() < Date.now()) {
    return `Pickup late · was due ${formatManila(car.next.startAt)} · ${car.next.customerName}`;
  }
  return manilaDateKey(new Date(car.next.startAt)) === todayKey
    ? `Goes out today ${formatManila(car.next.startAt, "time")}`
    : `Free until ${formatManila(car.next.startAt)}`;
}

/**
 * Every bookable car and where it stands right now. Free cars lead, with how
 * long they stay free, so a walk-in or a call can be answered at a glance.
 */
export function FleetBoardCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  const { fleetBoard, todayKey } = snapshot;
  const count = (state: FleetCarState) => fleetBoard.filter((car) => car.state === state).length;

  return (
    <Card className="xl:col-span-8">
      <CardHeader className="border-b">
        <CardTitle>Fleet right now</CardTitle>
        <CardDescription>
          {count("free")} free · {count("out") + count("overdue")} out · {count("maintenance")} in maintenance
        </CardDescription>
        <CardAction>
          <ExportRowsButton
            fileName="fleet-status"
            sheets={[
              {
                name: "Fleet right now",
                columns: [
                  { key: "plate", header: "Plate" },
                  { key: "car", header: "Car" },
                  { key: "state", header: "State", format: "status" },
                  { key: "renter", header: "Renter" },
                  { key: "backAt", header: "Due back", format: "datetime" },
                  { key: "nextAt", header: "Next booking", format: "datetime" },
                  { key: "nextRenter", header: "Next renter" },
                ],
                rows: fleetBoard.map((car) => ({
                  plate: car.vehicle.plateNumber,
                  car: car.vehicle.name,
                  state: car.state,
                  renter: car.current?.customerName ?? null,
                  backAt: car.current?.expectedReturnAt ?? null,
                  nextAt: car.next?.startAt ?? null,
                  nextRenter: car.next?.customerName ?? null,
                })),
              },
            ]}
          />
        </CardAction>
      </CardHeader>
      <CardContent>
        {fleetBoard.length ? (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {fleetBoard.map((car) => {
              const state = STATE[car.state];
              return (
                <li key={car.vehicle.id}>
                  <Link
                    className="flex h-full flex-col gap-2 rounded-md border p-3 transition-colors hover:border-brand-100 hover:bg-muted/40"
                    href={car.current ? `/rentals/${car.current.id}` : `/vehicles/${car.vehicle.id}`}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block font-mono text-xs font-medium">{car.vehicle.plateNumber}</span>
                        <span className="block truncate text-sm">{car.vehicle.name}</span>
                      </span>
                      <StatusBadge label={state.label} status={state.tone} />
                    </span>
                    <span className="text-xs text-muted-foreground">{detail(car, todayKey)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty className="border-0 p-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CarFront />
              </EmptyMedia>
              <EmptyTitle>No cars in the fleet yet</EmptyTitle>
              <EmptyDescription>Add a car to start taking bookings.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild size="sm">
                <Link href="/vehicles/new">
                  <Plus /> Add a car
                </Link>
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}
