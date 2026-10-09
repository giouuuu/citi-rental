export type PublicReview = {
  id: string;
  reviewer_name: string | null;
  body: string | null;
  photo_url: string | null;
  vehicle_label: string | null;
  source: "facebook" | "google" | "direct" | "other";
  reviewed_on: string | null;
};
