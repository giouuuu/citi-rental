import { archiveDeviceAction, saveDeviceAction } from "@/features/devices";
import { deviceDefinition } from "@/features/devices";
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
      action={saveDeviceAction}
      archiveAction={archiveDeviceAction}
      definition={deviceDefinition}
      id={id}
      saved={query.saved === "1"}
    />
  );
}
