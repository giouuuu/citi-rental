import {
  saveVehicleExpenseAction,
  vehicleExpenseDefinition,
} from "@/features/vehicle-costs";
import { ResourceCreateScreen } from "@/features/shared";
import { initialValuesFromSearchParams } from "@/features/shared/lib/resource-initial-values";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <ResourceCreateScreen
      action={saveVehicleExpenseAction}
      definition={vehicleExpenseDefinition}
      initialValues={initialValuesFromSearchParams(
        vehicleExpenseDefinition.fields,
        await searchParams,
      )}
    />
  );
}
