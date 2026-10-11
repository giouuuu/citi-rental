import { z } from "zod";

import {
  optionalNumber,
  requiredText,
} from "@/features/shared/schemas/schema-helpers";
import type { ResourceDefinition } from "@/features/shared/types/resource";

export const chargeTypeDefinition: ResourceDefinition = {
  key: "charge-type",
  table: "rental_charge_types",
  singular: "Charge type",
  plural: "Charge types",
  route: "/settings/charge-types",
  titleField: "name",
  searchColumn: "name",
  description:
    "Fees staff can add to a rental bill, such as car wash, delivery, extension, or other income. Tick “Add to every online booking” to charge one on each booking automatically.",
  writeRoles: ["owner", "admin"],
  archive: { field: "is_active", value: false, label: "Archive charge type" },
  parent: { label: "Settings", href: "/settings" },
  schema: z
    .object({
      name: requiredText("Name", 80),
      default_amount: optionalNumber(0),
      sort_order: optionalNumber(0).pipe(z.number().int().max(999).optional()),
      add_to_bookings: z.boolean().default(false),
    })
    .refine(
      (value) => !value.add_to_bookings || (value.default_amount ?? 0) > 0,
      {
        path: ["default_amount"],
        message: "Set the amount to add it to every booking.",
      },
    ),
  fields: [
    {
      name: "name",
      label: "Name",
      required: true,
      placeholder: "Car wash",
    },
    {
      name: "default_amount",
      label: "Default amount (PHP)",
      type: "number",
      step: "0.01",
      description:
        "Fills in the amount when staff add this charge. They can still change it. Leave blank to type it each time.",
    },
    {
      name: "sort_order",
      label: "Order in the list",
      type: "number",
      step: "1",
      description: "Lower numbers show first.",
    },
    {
      name: "add_to_bookings",
      label: "Add to every online booking",
      type: "checkbox",
      description:
        "Charged on each new online booking at the default amount. Customers see it in their total and bill before they pay. Bookings already made keep their price.",
      className: "md:col-span-2",
    },
  ],
  columns: [
    { key: "name", label: "Charge" },
    { key: "default_amount", label: "Default amount", format: "money" },
    { key: "add_to_bookings", label: "Every booking", format: "boolean" },
    { key: "is_active", label: "Active", format: "boolean" },
    { key: "updated_at", label: "Last updated", format: "datetime" },
  ],
  demoRows: [
    { id: "demo-charge-car-wash", name: "Car wash", default_amount: 300, add_to_bookings: false, is_active: true, updated_at: "2026-10-09T02:00:00Z" },
    { id: "demo-charge-delivery", name: "Delivery", default_amount: 500, add_to_bookings: false, is_active: true, updated_at: "2026-10-09T02:00:00Z" },
    { id: "demo-charge-other", name: "Other income", default_amount: null, add_to_bookings: false, is_active: true, updated_at: "2026-10-09T02:00:00Z" },
  ],
};
