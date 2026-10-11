import { expenseCategoryDefinition, saveExpenseCategoryAction } from "@/features/finance";
import { ResourceCreateScreen } from "@/features/shared";

export default function Page() {
  return (
    <ResourceCreateScreen
      action={saveExpenseCategoryAction}
      definition={expenseCategoryDefinition}
      initialValues={{ is_active: "true" }}
    />
  );
}
