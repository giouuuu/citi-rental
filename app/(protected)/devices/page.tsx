import { deviceDefinition } from "@/features/devices";
import { ResourceIndexScreen } from "@/features/shared";
export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <ResourceIndexScreen
      definition={deviceDefinition}
      searchParams={searchParams}
    />
  );
}
