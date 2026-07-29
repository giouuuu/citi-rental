import { z } from "zod";
import type { ResourceDefinition } from "@/features/shared/types/resource";

export const alertDefinition: ResourceDefinition = {
  key: "alert",
  table: "tracking_events",
  singular: "Alert",
  plural: "Alerts",
  route: "/alerts",
  titleField: "event_type",
  subtitleField: "severity",
  searchColumn: "event_type",
  description:
    "Review tracking, geofence, offline, overdue, and device events requiring staff attention.",
  writeRoles: ["owner", "admin", "staff"],
  allowCreate: false,
  schema: z.object({}),
  fields: [],
  detailColumns: [
    "event_type",
    "severity",
    "event_timestamp",
    "latitude",
    "longitude",
    "speed_kph",
    "is_acknowledged",
    "acknowledged_at",
    "resolution_note",
    "created_at",
    "updated_at",
    "vehicle_id",
    "gps_device_id",
    "rental_id",
    "geofence_id",
  ],
  columns: [
    { key: "event_type", label: "Event", format: "status" },
    { key: "severity", label: "Severity", format: "status" },
    { key: "event_timestamp", label: "Occurred", format: "datetime" },
    { key: "is_acknowledged", label: "Acknowledged", format: "boolean" },
  ],
  demoRows: [
    {
      id: "demo-alert",
      event_type: "geofence_exit",
      severity: "critical",
      event_timestamp: "2026-07-15T01:07:00Z",
      is_acknowledged: false,
      resolution_note: null,
      latitude: 14.5995,
      longitude: 120.9842,
    },
  ],
};
