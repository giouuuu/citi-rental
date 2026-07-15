import { vehicleDefinition } from "@/features/vehicles";
import { ResourceIndexScreen } from "@/features/shared";
export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <ResourceIndexScreen
      definition={vehicleDefinition}
      searchParams={searchParams}
    />
  );
}
