import { fixedAssetDefinition, saveFixedAssetAction } from "@/features/finance";
import { ResourceCreateScreen } from "@/features/shared";
import { initialValuesFromSearchParams } from "@/features/shared/lib/resource-initial-values";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <ResourceCreateScreen
      action={saveFixedAssetAction}
      definition={fixedAssetDefinition}
      initialValues={initialValuesFromSearchParams(fixedAssetDefinition.fields, await searchParams)}
    />
  );
}
