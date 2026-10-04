import { expenseDefinition, saveExpenseAction } from "@/features/finance";
import { ResourceCreateScreen } from "@/features/shared";
import { initialValuesFromSearchParams } from "@/features/shared/lib/resource-initial-values";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <ResourceCreateScreen
      action={saveExpenseAction}
      definition={expenseDefinition}
      initialValues={initialValuesFromSearchParams(expenseDefinition.fields, await searchParams)}
    />
  );
}
