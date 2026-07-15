import Link from "next/link";
import { Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import { archiveVehicleAction, saveVehicleAction } from "@/features/vehicles";
import { vehicleDefinition } from "@/features/vehicles";
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
      action={saveVehicleAction}
      actions={
        <Button asChild variant="outline">
          <Link href={`/vehicles/${id}/tracking`}>
            <Route /> Tracking
          </Link>
        </Button>
      }
      archiveAction={archiveVehicleAction}
      definition={vehicleDefinition}
      id={id}
      saved={query.saved === "1"}
    />
  );
}
