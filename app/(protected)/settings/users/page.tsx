import { userDefinition } from "@/features/users";
import { UserBulkActions } from "@/features/users/components/user-bulk-actions";
import { ResourceIndexScreen } from "@/features/shared";
export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <ResourceIndexScreen
      bulkActions={<UserBulkActions />}
      definition={userDefinition}
      searchParams={searchParams}
    />
  );
}
