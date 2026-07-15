import { saveRentalAction } from "@/features/rentals";
import { rentalDefinition } from "@/features/rentals";
import { ResourceDetailScreen } from "@/features/shared";
import { RentalWorkflowActions } from "@/features/rentals";
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
      action={saveRentalAction}
      actions={<RentalWorkflowActions id={id} />}
      definition={rentalDefinition}
      id={id}
      saved={query.saved === "1"}
    />
  );
}
