import {
  archiveChargeTypeAction,
  chargeTypeDefinition,
  saveChargeTypeAction,
} from "@/features/rentals";
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
      action={saveChargeTypeAction}
      archiveAction={archiveChargeTypeAction}
      definition={chargeTypeDefinition}
      id={id}
      saved={query.saved === "1"}
    />
  );
}
