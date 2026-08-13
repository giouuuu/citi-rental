import { driverDefinition, saveDriverAction } from "@/features/drivers";
import { ResourceCreateScreen } from "@/features/shared";

export default function Page() {
  return (
    <ResourceCreateScreen
      action={saveDriverAction}
      definition={driverDefinition}
    />
  );
}
