import { z } from "zod";

const itemStatus = z.enum([
  "ok",
  "scratch",
  "dent",
  "chip",
  "crack",
  "missing",
  "dirty",
  "damaged",
  "other",
]);

const photoKind = z.enum([
  "overview_front",
  "overview_rear",
  "overview_left",
  "overview_right",
  "overview_interior",
  "overview_dashboard",
  "odometer",
  "fuel_gauge",
  "damage_closeup",
  "signature",
  "other",
]);

export const inspectionItemInputSchema = z.object({
  area_code: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(120),
  item_group: z.string().trim().min(1).max(64),
  body_map_zone: z.string().trim().max(64).nullable().optional(),
  status: itemStatus,
  severity: z.coerce.number().int().min(1).max(5).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const inspectionPhotoInputSchema = z.object({
  storage_path: z.string().trim().min(1).max(500),
  kind: photoKind,
  area_code: z.string().trim().max(64).nullable().optional(),
  caption: z.string().trim().max(200).nullable().optional(),
});

export const submitInspectionSchema = z.object({
  rental_id: z.uuid(),
  inspection_type: z.enum(["pickup", "return"]),
  odometer: z.coerce.number().min(0),
  fuel_level: z.coerce.number().min(0).max(100),
  cleanliness: z.enum(["clean", "acceptable", "dirty", "needs_detailing"]),
  odor: z.enum(["none", "smoke", "strong", "other"]),
  notes: z.string().trim().max(4000).optional(),
  template_id: z.uuid().optional(),
  customer_signature_path: z.string().trim().max(500).optional(),
  customer_acknowledged: z.boolean().optional(),
  fuel_charge_amount: z.coerce.number().min(0).optional(),
  fuel_charge_note: z.string().trim().max(1000).optional(),
  damage_charge_amount: z.coerce.number().min(0).optional(),
  damage_charge_note: z.string().trim().max(1000).optional(),
  items: z.array(inspectionItemInputSchema).min(1),
  photos: z.array(inspectionPhotoInputSchema).default([]),
});

export type SubmitInspectionInput = z.infer<typeof submitInspectionSchema>;
