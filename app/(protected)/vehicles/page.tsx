import { vehicleDefinition } from "@/features/vehicles";
import { FleetBookingsSection } from "@/features/vehicles/components/fleet-bookings-section";
import { listFleetCars } from "@/features/vehicles/services/list-fleet-cars";
import { ResourceIndexScreen } from "@/features/shared";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const cars = await listFleetCars();
  return (
    <div className="space-y-6">
      <ResourceIndexScreen
        definition={vehicleDefinition}
        searchParams={searchParams}
      />
      <FleetBookingsSection cars={cars} />
    </div>
  );
}
