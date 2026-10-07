import { z } from "zod";

import { saveRentalAction } from "@/features/rentals";
import { rentalDefinition } from "@/features/rentals";
import { listMaintenanceAlerts, MaintenanceDueAlert } from "@/features/maintenance";
import { RENTAL_QUICK_CREATE } from "@/features/rentals/lib/rental-quick-create";
import { MANUAL_RENTAL_TOUR } from "@/features/rentals/lib/rental-tours";
import { suggestRentalReference } from "@/features/rentals/lib/rental-reference";
import { ResourceCreateScreen } from "@/features/shared";
import { ProductTour } from "@/features/shared/components/product-tour";
import { initialValuesFromSearchParams } from "@/features/shared/lib/resource-initial-values";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const initialValues: Record<string, string> = {
    reference_number: suggestRentalReference(),
    ...initialValuesFromSearchParams(rentalDefinition.fields, await searchParams),
  };
  const vehicleId = initialValues.vehicle_id;

  // Opened for one car (the vehicle page's "New rental"): warn, never block,
  // when that car has a service due.
  const servicesDue =
    vehicleId && z.uuid().safeParse(vehicleId).success && isSupabaseConfigured()
      ? await listMaintenanceAlerts({ vehicleId })
      : null;

  return (
    <ResourceCreateScreen
      action={saveRentalAction}
      actions={<ProductTour steps={MANUAL_RENTAL_TOUR} tourKey="manual-rental" />}
      definition={rentalDefinition}
      // Return readings belong to the return inspection, not a new booking.
      hiddenFields={["actual_return_at", "ending_odometer", "ending_fuel_level"]}
      initialValues={initialValues}
      quickCreate={RENTAL_QUICK_CREATE}
      notice={
        servicesDue?.ok ? (
          <MaintenanceDueAlert
            action={{ label: "View maintenance", href: `/vehicles/${vehicleId}?tab=maintenance` }}
            items={servicesDue.data}
          >
            <p className="mt-1">You can still book this car. Check the dates leave time for the service.</p>
          </MaintenanceDueAlert>
        ) : null
      }
    />
  );
}
