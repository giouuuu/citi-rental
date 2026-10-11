import {
  archiveVehicleExpenseCategoryAction,
  saveVehicleExpenseCategoryAction,
  vehicleExpenseCategoryDefinition,
} from "@/features/vehicle-costs";
import { ResourceDetailScreen } from "@/features/shared";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return (
    <ResourceDetailScreen
      action={saveVehicleExpenseCategoryAction}
      archiveAction={archiveVehicleExpenseCategoryAction}
      definition={vehicleExpenseCategoryDefinition}
      id={id}
      saved={query.saved === "1"}
    />
  );
}
