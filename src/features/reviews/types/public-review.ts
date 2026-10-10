export type PublicReview = {
  id: string;
  reviewer_name: string | null;
  body: string | null;
  photo_url: string | null;
  vehicle_label: string | null;
  source: "facebook" | "google" | "direct" | "website" | "other";
  reviewed_on: string | null;
  /** Stars from a renter's own review on the website; null for copied-in reviews. */
  rating: number | null;
};
