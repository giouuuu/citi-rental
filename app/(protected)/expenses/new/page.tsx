import {
  saveVehicleExpenseAction,
  vehicleExpenseDefinition,
} from "@/features/vehicle-costs";
import { ResourceCreateScreen } from "@/features/shared";

export default function Page() {
  return (
    <ResourceCreateScreen
      action={saveVehicleExpenseAction}
      definition={vehicleExpenseDefinition}
    />
  );
}
