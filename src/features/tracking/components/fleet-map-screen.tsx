import Link from "next/link";
import { ArrowRight, List, Map as MapIcon, RadioTower } from "lucide-react";
import { MapPreview } from "@/components/design-system/map-preview";
import { PageHeader } from "@/components/design-system/page-header";
import { StatusBadge } from "@/components/design-system/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import {
  listLatestLocations,
  locationTimestamp,
} from "@/features/tracking/services/tracking-service";
import { vehicleDefinition } from "@/features/vehicles";

async function listVehicles() {
  if (!isSupabaseConfigured()) return vehicleDefinition.demoRows ?? [];
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) throw new Error("Your session expired. Sign in and try again.");
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_active)
    throw new Error("Your profile is not active for this organization.");
  const { data, error } = await supabase
    .from("vehicles")
    .select("id, name, plate_number, status, updated_at")
    .eq("organization_id", profile.organization_id)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
}

function format(value: unknown) {
  if (!value) return "Not received";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(new Date(String(value)));
}

export async function FleetMapScreen() {
  const [vehicles, locations] = await Promise.all([
    listVehicles(),
    listLatestLocations(),
  ]);
  const byVehicle = new Map(
    locations.map((location) => [location.vehicle_id, location]),
  );
  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Button variant="outline">
            <List /> List and map view
          </Button>
        }
        breadcrumbs={[
          { label: "Workspace", href: "/dashboard" },
          { label: "Live fleet map" },
        ]}
        description="Current and last-known positions. Timestamps identify stale data without presenting it as live."
        title="Live fleet map"
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapIcon className="size-5" /> Fleet positions
            </CardTitle>
            <CardDescription>
              Map detail is representative until the configured map provider
              loads; the list contains authoritative timestamps.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MapPreview className="min-h-[560px]" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Vehicle list</CardTitle>
            <CardDescription>
              {locations.length} trackers reporting a latest position.
            </CardDescription>
          </CardHeader>
          <CardContent
            aria-label="Scrollable vehicle list"
            className="max-h-[560px] space-y-3 overflow-y-auto overscroll-contain pr-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            role="region"
            tabIndex={0}
          >
            {vehicles.map((vehicle) => {
              const location = byVehicle.get(vehicle.id);
              const status = String(
                location?.status ?? location?.connection_status ?? "unknown",
              );
              return (
                <div className="rounded-lg border p-4" key={vehicle.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{String(vehicle.name)}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {String(vehicle.plate_number)}
                      </p>
                    </div>
                    <StatusBadge status={status} />
                  </div>
                  <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
                    <div className="flex justify-between gap-3">
                      <dt>Device timestamp</dt>
                      <dd className="text-right tabular-nums">
                        {format(
                          locationTimestamp(
                            location ?? { vehicle_id: vehicle.id },
                          ),
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>Last received</dt>
                      <dd className="text-right tabular-nums">
                        {format(location?.received_at ?? location?.created_at)}
                      </dd>
                    </div>
                  </dl>
                  <Button
                    asChild
                    className="mt-3 w-full"
                    size="sm"
                    variant="outline"
                  >
                    <Link href={`/vehicles/${vehicle.id}/tracking`}>
                      Open tracking <ArrowRight />
                    </Link>
                  </Button>
                </div>
              );
            })}
            {!vehicles.length ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                <RadioTower className="mx-auto mb-3 size-8" />
                No active vehicles are available.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
