import {
  archiveCustomerAction,
  CustomerDetailTabs,
  CustomerRentalHistory,
  customerDefinition,
  listCustomerRentals,
  saveCustomerAction,
} from "@/features/customers";
import { ResourceDetailScreen } from "@/features/shared";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const rentals = await listCustomerRentals(id);
  return (
    <ResourceDetailScreen
      action={saveCustomerAction}
      archiveAction={archiveCustomerAction}
      definition={customerDefinition}
      id={id}
      saved={query.saved === "1"}
    >
      {({ form }) => (
        <CustomerDetailTabs info={form} rentals={<CustomerRentalHistory rentals={rentals} />} />
      )}
    </ResourceDetailScreen>
  );
}
