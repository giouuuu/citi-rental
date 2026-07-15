import { geofenceDefinition } from "@/features/geofences";
import { ResourceIndexScreen } from "@/features/shared";
export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <ResourceIndexScreen
      definition={geofenceDefinition}
      searchParams={searchParams}
    />
  );
}
