import { z } from "zod";
import {
  optionalText,
  optionalUuid,
  requiredText,
} from "@/features/shared/schemas/schema-helpers";
import type { ResourceDefinition } from "@/features/shared/types/resource";

export const deviceDefinition: ResourceDefinition = {
  key: "device",
  table: "gps_devices",
  singular: "GPS device",
  plural: "GPS devices",
  route: "/devices",
  titleField: "name",
  subtitleField: "unique_identifier",
  searchColumn: "unique_identifier",
  description:
    "Register SinoTrack hardware, review tracker health, and maintain vehicle assignments.",
  writeRoles: ["owner", "admin"],
  archive: { field: "is_active", value: false, label: "Deactivate device" },
  schema: z.object({
    traccar_device_id: optionalText(80),
    unique_identifier: requiredText("IMEI or unique identifier", 120),
    name: requiredText("Device name", 120),
    model: optionalText(80),
    protocol: optionalText(80),
    traccar_server_reference: optionalText(160),
    sim_phone_number: optionalText(40),
    sim_network: optionalText(80),
    vehicle_id: optionalUuid,
    installed_at: optionalText(40),
    status: z.enum(["online", "delayed", "offline", "unknown"]),
    notes: optionalText(),
    is_active: z.boolean(),
  }),
  fields: [
    {
      name: "unique_identifier",
      label: "IMEI / unique identifier",
      required: true,
    },
    { name: "name", label: "Device name", required: true },
    { name: "traccar_device_id", label: "Traccar device ID" },
    { name: "model", label: "SinoTrack model" },
    { name: "protocol", label: "Protocol" },
    { name: "traccar_server_reference", label: "Traccar server reference" },
    { name: "sim_phone_number", label: "SIM phone number", type: "tel" },
    { name: "sim_network", label: "SIM network" },
    {
      name: "vehicle_id",
      label: "Assigned vehicle",
      type: "select",
      reference: {
        table: "vehicles",
        labelColumn: "plate_number",
        secondaryColumn: "name",
      },
      description:
        "Assignment rules are finalized by the database transaction.",
    },
    { name: "installed_at", label: "Installation date", type: "date" },
    {
      name: "status",
      label: "Connection status",
      type: "select",
      required: true,
      options: ["online", "delayed", "offline", "unknown"].map((value) => ({
        value,
        label: value,
      })),
    },
    {
      name: "is_active",
      label: "Device is active",
      type: "checkbox",
      description:
        "Inactive devices remain in historical rental and tracking records.",
    },
    {
      name: "notes",
      label: "Notes",
      type: "textarea",
      className: "md:col-span-2",
    },
  ],
  columns: [
    { key: "name", label: "Device" },
    { key: "unique_identifier", label: "Identifier" },
    { key: "status", label: "Status", format: "status" },
    {
      key: "last_communication_at",
      label: "Last communication",
      format: "datetime",
    },
    { key: "is_active", label: "Active", format: "boolean" },
  ],
  demoRows: [
    {
      id: "demo-device",
      name: "SinoTrack ST-901",
      unique_identifier: "864180050001842",
      status: "online",
      last_communication_at: "2026-07-15T01:15:00Z",
      is_active: true,
    },
  ],
};
