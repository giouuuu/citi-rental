import {
  saveVehicleExpenseAction,
  vehicleExpenseDefinition,
} from "@/features/vehicle-costs";
import { ResourceCreateScreen } from "@/features/shared";
import { manilaDateKey } from "@/features/shared/lib/manila-time";
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
      initialValues={{
        // Most costs are logged the day they're paid.
        incurred_on: manilaDateKey(new Date()),
        ...initialValuesFromSearchParams(
          vehicleExpenseDefinition.fields,
          await searchParams,
        ),
      }}
    />
  );
}
