import { Clock3, Gauge, MapPin, Route, Satellite } from "lucide-react";
import { notFound } from "next/navigation";
import { MapPreview } from "@/components/design-system/map-preview";
import { PageHeader } from "@/components/design-system/page-header";
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
  listVehicleRoute,
  locationTimestamp,
} from "@/features/tracking/services/tracking-service";
import { vehicleDefinition } from "@/features/vehicles";

async function getVehicle(id: string) {
  if (!isSupabaseConfigured())
    return vehicleDefinition.demoRows?.find((row) => row.id === id) ?? null;
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
    .select("id, plate_number, name")
    .eq("organization_id", profile.organization_id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

function date(value: unknown) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(new Date(String(value)));
}

export async function VehicleTrackingScreen({ id }: { id: string }) {
  const [vehicle, points] = await Promise.all([
    getVehicle(id),
    listVehicleRoute(id),
  ]);
  if (!vehicle) notFound();
  const speeds = points
    .map((point) => Number(point.speed_kph ?? 0))
    .filter(Number.isFinite);
  const maxSpeed = Math.max(0, ...speeds);
  const avg = speeds.length
    ? speeds.reduce((sum, value) => sum + value, 0) / speeds.length
    : 0;
  const last = points.at(-1);
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Vehicles", href: "/vehicles" },
          { label: String(vehicle.plate_number), href: `/vehicles/${id}` },
          { label: "Tracking" },
        ]}
        description="Ordered route history with separate GPS and ingestion timestamps."
        title={`${String(vehicle.name)} tracking`}
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={Route}
          label="Route points"
          value={String(points.length)}
        />
        <Metric
          icon={Gauge}
          label="Maximum speed"
          value={`${maxSpeed.toFixed(1)} km/h`}
        />
        <Metric
          icon={Gauge}
          label="Average speed"
          value={`${avg.toFixed(1)} km/h`}
        />
        <Metric
          icon={Clock3}
          label="Latest GPS time"
          value={date(locationTimestamp(last ?? { vehicle_id: id }))}
        />
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Recent route</CardTitle>
          <CardDescription>
            Up to 1,000 ordered points are loaded to keep long histories
            responsive.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MapPreview className="min-h-[460px]" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Tracking timeline</CardTitle>
          <CardDescription>
            Device time is the event source; received time shows synchronization
            delay.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {points
            .slice(-20)
            .reverse()
            .map((point, index) => (
              <div
                className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_auto]"
                key={String(point.id ?? `${locationTimestamp(point)}-${index}`)}
              >
                <span className="flex items-center gap-2 text-sm">
                  <MapPin className="size-4 text-primary" />
                  {String(point.latitude)}, {String(point.longitude)}
                </span>
                <span className="text-xs text-muted-foreground">
                  <Satellite className="mr-1 inline size-3" />
                  GPS {date(locationTimestamp(point))}
                  <br />
                  Received {date(point.received_at ?? point.created_at)}
                </span>
                <span className="font-mono text-sm">
                  {Number(point.speed_kph ?? 0).toFixed(1)} km/h
                </span>
              </div>
            ))}
          {!points.length ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No route points were received for this vehicle.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Route;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-5">
        <div className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="font-mono text-sm font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
