import { driverDefinition } from "@/features/drivers";
import { ResourceIndexScreen } from "@/features/shared";

export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <ResourceIndexScreen
      definition={driverDefinition}
      searchParams={searchParams}
    />
  );
}
