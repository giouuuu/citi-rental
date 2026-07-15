import { saveGeofenceAction } from "@/features/geofences";
import { geofenceDefinition } from "@/features/geofences";
import { ResourceCreateScreen } from "@/features/shared";
export default function Page() {
  return (
    <ResourceCreateScreen
      action={saveGeofenceAction}
      definition={geofenceDefinition}
    />
  );
}
