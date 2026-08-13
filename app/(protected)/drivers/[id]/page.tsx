import {
  archiveDriverAction,
  driverDefinition,
  saveDriverAction,
} from "@/features/drivers";
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
      action={saveDriverAction}
      archiveAction={archiveDriverAction}
      definition={driverDefinition}
      id={id}
      saved={query.saved === "1"}
    />
  );
}
