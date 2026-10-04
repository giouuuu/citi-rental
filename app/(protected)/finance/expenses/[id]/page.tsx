import {
  ExpenseSummaryCard,
  expenseDefinition,
  saveExpenseAction,
  voidExpenseAction,
} from "@/features/finance";
import { ResourceDetailScreen } from "@/features/shared";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return (
    <ResourceDetailScreen
      action={saveExpenseAction}
      archiveAction={voidExpenseAction}
      definition={expenseDefinition}
      id={id}
      saved={query.saved === "1"}
    >
      {({ form, row }) => (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          {form}
          <ExpenseSummaryCard row={row} />
        </div>
      )}
    </ResourceDetailScreen>
  );
}
