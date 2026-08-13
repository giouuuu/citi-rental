import { z } from "zod";

import {
  optionalEmail,
  optionalNumber,
  optionalText,
  requiredText,
} from "@/features/shared/schemas/schema-helpers";
import type { ResourceDefinition } from "@/features/shared/types/resource";

export const DRIVER_STATUSES = ["available", "on_leave", "inactive"] as const;

export const driverDefinition: ResourceDefinition = {
  key: "driver",
  table: "drivers",
  singular: "Driver",
  plural: "Drivers",
  route: "/drivers",
  titleField: "full_name",
  subtitleField: "phone_number",
  searchColumn: "full_name",
  description:
    "Maintain the driver roster for with-driver rentals, including licences, rates, and availability.",
  writeRoles: ["owner", "admin", "staff"],
  archive: { field: "status", value: "inactive", label: "Archive driver" },
  schema: z.object({
    full_name: requiredText("Full name", 120),
    phone_number: requiredText("Phone number", 40),
    email: optionalEmail,
    address: optionalText(500),
    drivers_license_number: requiredText("Driver's license number", 80),
    drivers_license_expires_at: optionalText(40),
    license_type: optionalText(60),
    emergency_contact_name: optionalText(120),
    emergency_contact_number: optionalText(40),
    daily_rate: optionalNumber(0),
    hired_at: optionalText(40),
    status: z.enum(DRIVER_STATUSES),
    notes: optionalText(),
  }),
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
      description: "Must be unique within the organization.",
    },
    {
      name: "drivers_license_expires_at",
      label: "License expiration",
      type: "date",
    },
    {
      name: "license_type",
      label: "License type",
      placeholder: "Professional / Non-professional",
    },
    {
      name: "daily_rate",
      label: "Driver daily rate (PHP)",
      type: "number",
      step: "0.01",
      description: "Charged on top of the vehicle rate for with-driver rentals.",
    },
    { name: "hired_at", label: "Hired on", type: "date" },
    {
      name: "status",
      label: "Status",
      type: "select",
      required: true,
      options: [
        { label: "Available", value: "available" },
        { label: "On leave", value: "on_leave" },
        { label: "Inactive", value: "inactive" },
      ],
      description:
        "Operational status only. Day-to-day assignment comes from rental dates, not this field.",
    },
    { name: "emergency_contact_name", label: "Emergency contact name" },
    {
      name: "emergency_contact_number",
      label: "Emergency contact number",
      type: "tel",
    },
    {
      name: "notes",
      label: "Notes",
      type: "textarea",
      className: "md:col-span-2",
    },
  ],
  columns: [
    { key: "full_name", label: "Driver" },
    { key: "phone_number", label: "Phone" },
    { key: "drivers_license_number", label: "License" },
    { key: "daily_rate", label: "Daily rate", format: "number" },
    { key: "status", label: "Status", format: "status" },
    { key: "updated_at", label: "Last updated", format: "datetime" },
  ],
  demoRows: [
    {
      id: "demo-driver",
      full_name: "Ramon Dela Cruz",
      phone_number: "+63 918 555 0142",
      drivers_license_number: "D01-98-765432",
      daily_rate: 900,
      status: "available",
      updated_at: "2026-08-10T02:00:00Z",
    },
  ],
};
