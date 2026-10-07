import {
  deleteVehicleExpenseAction,
  ExpenseReceiptCard,
  saveVehicleExpenseAction,
  vehicleExpenseDefinition,
} from "@/features/vehicle-costs";
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
      action={saveVehicleExpenseAction}
      archiveAction={deleteVehicleExpenseAction}
      definition={vehicleExpenseDefinition}
      id={id}
      saved={query.saved === "1"}
    >
      {({ form, row }) => (
        <div className="space-y-6">
          {form}
          <ExpenseReceiptCard
            expenseId={id}
            receiptPath={
              typeof row.receipt_path === "string" ? row.receipt_path : null
            }
          />
        </div>
      )}
    </ResourceDetailScreen>
  );
}
