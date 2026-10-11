import {
  saveVehicleExpenseCategoryAction,
  vehicleExpenseCategoryDefinition,
} from "@/features/vehicle-costs";
import { ResourceCreateScreen } from "@/features/shared";

export default function Page() {
  return (
    <ResourceCreateScreen
      action={saveVehicleExpenseCategoryAction}
      definition={vehicleExpenseCategoryDefinition}
      initialValues={{ is_active: "true" }}
    />
  );
}
