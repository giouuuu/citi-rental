import { saveVehicleAction } from "@/features/vehicles";
import { vehicleDefinition } from "@/features/vehicles";
import { ResourceCreateScreen } from "@/features/shared";
export default function Page() {
  return (
    <ResourceCreateScreen
      action={saveVehicleAction}
      definition={vehicleDefinition}
    />
  );
}
