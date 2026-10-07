import { missingVehicleGalleryLabels } from "@/features/vehicles/lib/vehicle-gallery";

/** One reason a car is missing from the public booking site, with its fix. */
export type WebsiteListingBlocker = {
  title: string;
  detail: string;
  fix?: { label: string; href: string };
};

/**
 * Why `list_public_available_vehicles` leaves this car out. Mirrors that
 * RPC's filters: the site is on, the car is `available`, and all 6 gallery
 * angles are uploaded. Empty means customers can book it.
 */
export function websiteListingBlockers({
  vehicleId,
  status,
  photos,
  siteOn,
}: {
  vehicleId: string;
  status: string | null;
  photos: Array<{ kind: string }>;
  siteOn: boolean;
}): WebsiteListingBlocker[] {
  const blockers: WebsiteListingBlocker[] = [];
  const detailsHref = `/vehicles/${vehicleId}?tab=info`;

  if (!siteOn) {
    blockers.push({
      title: "Website booking is off",
      detail: "The company profile is inactive or hidden from the public site, so no car is listed.",
      fix: { label: "Open settings", href: "/settings" },
    });
  }
  if (status === "maintenance") {
    blockers.push({
      title: "In maintenance",
      detail: "Cars in maintenance are hidden. Set the status back to Available once it's road-ready.",
      fix: { label: "Edit status", href: detailsHref },
    });
  } else if (status === "inactive") {
    blockers.push({
      title: "Archived",
      detail: "Archived cars are hidden. Set the status to Available to list it again.",
      fix: { label: "Edit status", href: detailsHref },
    });
  } else if (status !== "available") {
    blockers.push({
      title: "Not marked available",
      detail: "Only cars with status Available are listed.",
      fix: { label: "Edit status", href: detailsHref },
    });
  }
  const missing = missingVehicleGalleryLabels(photos);
  if (missing.length > 0) {
    blockers.push({
      title: `${missing.length} required ${missing.length === 1 ? "photo" : "photos"} missing`,
      detail: `Upload ${missing.join(", ")}. The website needs all 6 angles.`,
      fix: { label: "Upload photos", href: `/vehicles/${vehicleId}?tab=photos` },
    });
  }
  return blockers;
}
