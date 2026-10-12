import { chargeTypeDefinition, saveChargeTypeAction } from "@/features/rentals";
import { ResourceCreateScreen } from "@/features/shared";

export default function Page() {
  return (
    <ResourceCreateScreen
      action={saveChargeTypeAction}
      definition={chargeTypeDefinition}
      initialValues={{ is_active: "true" }}
    />
  );
}
