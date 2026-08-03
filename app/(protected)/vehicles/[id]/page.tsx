import Link from "next/link";
import { Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  archiveVehicleAction,
  listVehiclePhotos,
  saveVehicleAction,
  VehicleGalleryPanel,
  vehicleDefinition,
} from "@/features/vehicles";
import { ResourceDetailScreen } from "@/features/shared";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { listVehicleRentals } from "@/features/vehicles/services/list-vehicle-rentals";
import { VehicleDetailTabs } from "@/features/vehicles/components/vehicle-detail-tabs";
import {
  CloneCategoryTemplateCard,
  listVehicleKnownDamages,
  VehicleKnownDamagesPanel,
} from "@/features/inspections";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);

  const rentals = isSupabaseConfigured() ? await listVehicleRentals(id) : [];
  const damages = isSupabaseConfigured()
    ? await listVehicleKnownDamages(id, { includeResolved: true })
    : [];
  const photos = isSupabaseConfigured() ? await listVehiclePhotos(id) : [];

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
      {({ form, row }) => (
        <VehicleDetailTabs
          damages={
            <div className="space-y-6">
              <VehicleKnownDamagesPanel
                damages={damages.filter((damage) => !damage.isResolved)}
              />
              <CloneCategoryTemplateCard
                category={
                  typeof row.category === "string" ? row.category : null
                }
              />
            </div>
          }
          gallery={
            <VehicleGalleryPanel
              photos={photos}
              status={typeof row.status === "string" ? row.status : null}
              vehicleId={id}
            />
          }
          info={form}
          rentals={rentals}
        />
      )}
    </ResourceDetailScreen>
  );
}
