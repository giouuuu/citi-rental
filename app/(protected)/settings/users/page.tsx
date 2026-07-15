import { userDefinition } from "@/features/users";
import { ResourceIndexScreen } from "@/features/shared";
export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <ResourceIndexScreen
      definition={userDefinition}
      searchParams={searchParams}
    />
  );
}
