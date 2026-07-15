import { z } from "zod";
import {
  optionalEmail,
  optionalText,
  optionalUrl,
  requiredText,
} from "@/features/shared/schemas/schema-helpers";
import type { ResourceDefinition } from "@/features/shared/types/resource";

export const customerDefinition: ResourceDefinition = {
  key: "customer",
  table: "customers",
  singular: "Customer",
  plural: "Customers",
  route: "/customers",
  titleField: "full_name",
  subtitleField: "phone_number",
  searchColumn: "full_name",
  description:
    "Maintain renter contacts, license details, consent, and rental eligibility.",
  writeRoles: ["administrator", "rental_staff"],
  archive: { field: "is_blocked", value: true, label: "Block customer" },
  schema: z
    .object({
      full_name: requiredText("Full name", 120),
      email: optionalEmail,
      phone_number: requiredText("Phone number", 40),
      address: optionalText(500),
      drivers_license_number: requiredText("Driver's license number", 80),
      drivers_license_expires_at: optionalText(40),
      emergency_contact_name: optionalText(120),
      emergency_contact_number: optionalText(40),
      facebook_profile_url: optionalUrl,
      notes: optionalText(),
      is_blocked: z.boolean(),
      tracking_consent_at: optionalText(40),
      tracking_disclosure_version: optionalText(40),
    })
    .refine(
      (value) =>
        Boolean(value.tracking_consent_at) ===
        Boolean(value.tracking_disclosure_version),
      {
        path: ["tracking_disclosure_version"],
        message:
          "Consent time and disclosure version must be recorded together.",
      },
    ),
  fields: [
    { name: "full_name", label: "Full name", required: true },
    {
      name: "phone_number",
      label: "Phone number",
      type: "tel",
      required: true,
    },
    { name: "email", label: "Email", type: "email" },
    { name: "address", label: "Address" },
    {
      name: "drivers_license_number",
      label: "Driver's license number",
      required: true,
    },
    {
      name: "drivers_license_expires_at",
      label: "License expiration",
      type: "date",
    },
    { name: "emergency_contact_name", label: "Emergency contact name" },
    {
      name: "emergency_contact_number",
      label: "Emergency contact number",
      type: "tel",
    },
    {
      name: "facebook_profile_url",
      label: "Facebook profile URL",
      type: "url",
      description:
        "Optional reference supplied voluntarily; no automated scoring is performed.",
    },
    {
      name: "tracking_consent_at",
      label: "GPS tracking consent time",
      type: "datetime-local",
    },
    { name: "tracking_disclosure_version", label: "Disclosure version" },
    {
      name: "is_blocked",
      label: "Block from new rentals",
      type: "checkbox",
      description: "Blocked customers remain visible in rental history.",
    },
    {
      name: "notes",
      label: "Notes",
      type: "textarea",
      className: "md:col-span-2",
    },
  ],
  columns: [
    { key: "full_name", label: "Customer" },
    { key: "phone_number", label: "Phone" },
    { key: "drivers_license_number", label: "License" },
    { key: "is_blocked", label: "Blocked", format: "boolean" },
    { key: "updated_at", label: "Last updated", format: "datetime" },
  ],
  demoRows: [
    {
      id: "demo-customer",
      full_name: "Mika Santos",
      phone_number: "+63 917 555 0184",
      drivers_license_number: "N01-23-456789",
      is_blocked: false,
      updated_at: "2026-07-15T00:40:00Z",
    },
  ],
};
