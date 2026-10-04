import {
  DepreciationScheduleCard,
  fixedAssetDefinition,
  saveFixedAssetAction,
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
      action={saveFixedAssetAction}
      definition={fixedAssetDefinition}
      id={id}
      saved={query.saved === "1"}
    >
      {({ form, row }) => (
        <div className="space-y-6">
          {form}
          <DepreciationScheduleCard row={row} />
        </div>
      )}
    </ResourceDetailScreen>
  );
}
