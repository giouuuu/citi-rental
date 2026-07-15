import { VehicleTrackingScreen } from "@/features/tracking";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <VehicleTrackingScreen id={id} />;
}
