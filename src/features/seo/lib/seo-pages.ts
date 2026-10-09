/**
 * Public pages written to rank for one search each. The auth proxy, the
 * sitemap, and the homepage footer all read this list, so a new page is one
 * entry here plus its `app/<path>/page.tsx`.
 */
export const SEO_PAGES = [
  {
    path: "/car-rental-delivery-cebu",
    label: "Car delivery anywhere in Cebu",
  },
  {
    path: "/car-rental-mactan-cebu-airport",
    label: "Airport car rental",
  },
  {
    path: "/car-rental-with-driver-cebu",
    label: "Car rental with driver",
  },
] as const;

export type SeoPagePath = (typeof SEO_PAGES)[number]["path"];
