import { z } from "zod";

import { optionalText } from "@/features/shared/schemas/schema-helpers";
import type { ResourceDefinition } from "@/features/shared/types/resource";

export const REVIEW_SOURCES = ["facebook", "google", "direct", "website", "other"] as const;

export const REVIEW_SOURCE_LABELS: Record<(typeof REVIEW_SOURCES)[number], string> = {
  facebook: "Facebook",
  google: "Google",
  direct: "Told us directly",
  website: "Our website (renter)",
  other: "Other",
};

export const REVIEW_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

export const reviewDefinition: ResourceDefinition = {
  key: "review",
  table: "customer_reviews",
  singular: "Review",
  plural: "Reviews",
  route: "/reviews",
  titleField: "reviewer_name",
  subtitleField: "vehicle_label",
  searchColumn: "reviewer_name",
  description:
    "Reviews and photos from past renters, shown on the homepage. Renters can rate a finished trip from their account; those arrive hidden until you publish them.",
  writeRoles: ["owner", "admin"],
  archive: { field: "is_hidden", value: true, label: "Hide from website" },
  detailColumns: [
    "reviewer_name",
    "body",
    "photo_url",
    "vehicle_label",
    "source",
    "reviewed_on",
    "sort_order",
    "is_hidden",
    "rating",
  ],
  schema: z.object({
    reviewer_name: optionalText(120),
    body: optionalText(2000),
    vehicle_label: optionalText(120),
    source: z.enum(REVIEW_SOURCES, "Choose where the review came from."),
    reviewed_on: optionalText(40),
    sort_order: z.coerce
      .number()
      .int("Use a whole number.")
      .min(-10000)
      .max(10000)
      .optional(),
    is_hidden: z.boolean(),
  }),
  fields: [
    {
      name: "reviewer_name",
      label: "Customer name",
      placeholder: "As it appears on the review",
      description: "Leave blank, with the review too, to post a photo on its own.",
    },
    {
      name: "source",
      label: "Posted on",
      type: "select",
      required: true,
      options: REVIEW_SOURCES.map((value) => ({
        value,
        label: REVIEW_SOURCE_LABELS[value],
      })),
    },
    {
      name: "body",
      label: "Review",
      type: "textarea",
      placeholder: "Paste what the customer wrote",
      className: "md:col-span-2",
    },
    {
      name: "photo",
      label: "Customer photo (optional)",
      type: "image",
      accept: REVIEW_PHOTO_ACCEPT,
      previewColumn: "photo_url",
      removable: true,
      description:
        "Only a photo of this customer, shared with their OK. JPEG, PNG or WebP, up to 5MB.",
      className: "md:col-span-2",
    },
    {
      name: "vehicle_label",
      label: "Car",
      placeholder: "Toyota Avanza",
      description: "Shown under the photo or review.",
    },
    { name: "reviewed_on", label: "Review date", type: "date" },
    {
      name: "sort_order",
      label: "Display order",
      type: "number",
      step: "1",
      placeholder: "0",
      description: "Lower numbers show first on the homepage.",
    },
    {
      name: "is_hidden",
      label: "Hide from website",
      type: "checkbox",
      description: "Keeps the review here without showing it on the homepage.",
    },
  ],
  columns: [
    { key: "photo_url", label: "Photo", format: "image" },
    {
      key: "reviewer_name",
      label: "Customer",
      secondary: [{ key: "vehicle_label", label: "Car" }],
    },
    { key: "rating", label: "Stars", format: "number" },
    { key: "body", label: "Review", exportOnly: true },
    { key: "source", label: "Posted on" },
    { key: "is_hidden", label: "Hidden", format: "boolean" },
    { key: "sort_order", label: "Order", format: "number" },
    { key: "reviewed_on", label: "Review date", format: "date" },
    { key: "updated_at", label: "Last updated", format: "datetime" },
  ],
  filters: [
    {
      param: "visibility",
      column: "is_hidden",
      op: "eq",
      label: "Visibility",
      picker: true,
      valueLabels: { false: "On website", true: "Hidden" },
    },
    {
      param: "source",
      column: "source",
      op: "eq",
      label: "Posted on",
      picker: true,
      valueLabels: REVIEW_SOURCE_LABELS,
    },
  ],
  demoRows: [
    {
      id: "demo-review",
      reviewer_name: "Reign Gallano",
      vehicle_label: "Toyota Vios",
      body: "The owner was very responsive. We used the car for 6 days and had a great experience. Highly recommended!",
      source: "facebook",
      is_hidden: false,
      sort_order: 0,
      updated_at: "2026-10-09T02:00:00Z",
    },
  ],
};
