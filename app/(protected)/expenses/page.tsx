import { vehicleExpenseDefinition } from "@/features/vehicle-costs";
import { ResourceIndexScreen } from "@/features/shared";

export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <ResourceIndexScreen
      definition={vehicleExpenseDefinition}
      searchParams={searchParams}
    />
  );
}
