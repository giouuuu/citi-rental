import type { MetadataRoute } from "next";

import { listPublicAvailableVehicles } from "@/features/vehicles/services/list-public-available-vehicles";
import { siteUrl } from "@/lib/site-url";

/** The homepage plus one booking page per bookable car. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const vehicles = await listPublicAvailableVehicles();

  return [
    {
      url: base,
      changeFrequency: "daily",
      priority: 1,
      images: [`${base}/opengraph-image`],
    },
    ...vehicles.map((vehicle) => {
      const images = [
        ...new Set(
          [
            vehicle.photo_url,
            ...vehicle.gallery.map((photo) => photo.url),
          ].filter((url): url is string => Boolean(url)),
        ),
      ];
      return {
        url: `${base}/book/${vehicle.id}`,
        changeFrequency: "weekly" as const,
        priority: 0.8,
        ...(images.length ? { images } : {}),
      };
    }),
  ];
}
