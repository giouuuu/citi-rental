import { customerDefinition } from "@/features/customers";
import { ResourceIndexScreen } from "@/features/shared";
export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <ResourceIndexScreen
      definition={customerDefinition}
      searchParams={searchParams}
    />
  );
}
