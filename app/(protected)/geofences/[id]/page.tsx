import {
  archiveGeofenceAction,
  saveGeofenceAction,
} from "@/features/geofences";
import { geofenceDefinition } from "@/features/geofences";
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
      action={saveGeofenceAction}
      archiveAction={archiveGeofenceAction}
      definition={geofenceDefinition}
      id={id}
      saved={query.saved === "1"}
    />
  );
}
