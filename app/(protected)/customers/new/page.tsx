import { saveCustomerAction } from "@/features/customers";
import { customerDefinition } from "@/features/customers";
import { ResourceCreateScreen } from "@/features/shared";
export default function Page() {
  return (
    <ResourceCreateScreen
      action={saveCustomerAction}
      definition={customerDefinition}
    />
  );
}
