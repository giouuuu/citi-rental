import { saveDeviceAction } from "@/features/devices";
import { deviceDefinition } from "@/features/devices";
import { ResourceCreateScreen } from "@/features/shared";
export default function Page() {
  return (
    <ResourceCreateScreen
      action={saveDeviceAction}
      definition={deviceDefinition}
    />
  );
}
