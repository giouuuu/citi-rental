import { notFound, permanentRedirect } from "next/navigation";

import { fullQueryString, vehiclePageKey } from "@/features/booking/lib/booking-continue";
import { getPublicVehicle } from "@/features/booking/services/public-booking-service";

/**
 * `/cars/<slug>` is the short form of a car's link; its page is the booking
 * page, `/book/<slug>`. The query (trip, utm, fbclid) carries over.
 */
export default async function CarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const vehicle = await getPublicVehicle(slug);
  if (!vehicle) notFound();

  permanentRedirect(`/book/${vehiclePageKey(vehicle)}${fullQueryString(query)}`);
}
