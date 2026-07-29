import Link from "next/link";
import { Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import { archiveVehicleAction, saveVehicleAction } from "@/features/vehicles";
import { vehicleDefinition } from "@/features/vehicles";
import { ResourceDetailScreen } from "@/features/shared";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { listVehicleRentals } from "@/features/vehicles/services/list-vehicle-rentals";
import { VehicleDetailTabs } from "@/features/vehicles/components/vehicle-detail-tabs";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);

  const rentals = isSupabaseConfigured() ? await listVehicleRentals(id) : [];

  return (
    <ResourceDetailScreen
      action={saveVehicleAction}
      actions={
        <Button asChild variant="outline">
          <Link href={`/vehicles/${id}/tracking`}>
            <Route /> Tracking
          </Link>
        </Button>
      }
      archiveAction={archiveVehicleAction}
      definition={vehicleDefinition}
      id={id}
      saved={query.saved === "1"}
    >
      {({ form }) => <VehicleDetailTabs info={form} rentals={rentals} />}
    </ResourceDetailScreen>
  );
}
