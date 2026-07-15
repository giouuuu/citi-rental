import { z } from "zod";
import {
  optionalNumber,
  optionalText,
  requiredText,
} from "@/features/shared/schemas/schema-helpers";
import type { ResourceDefinition } from "@/features/shared/types/resource";

export const rentalDefinition: ResourceDefinition = {
  key: "rental",
  table: "rentals",
  singular: "Rental",
  plural: "Rentals",
  route: "/rentals",
  titleField: "reference_number",
  subtitleField: "status",
  searchColumn: "reference_number",
  description:
    "Create reservations, start and complete rentals, and review time-bounded tracking history.",
  writeRoles: ["administrator", "rental_staff"],
  archive: { field: "status", value: "cancelled", label: "Cancel rental" },
  schema: z
    .object({
      reference_number: requiredText("Reference number", 60),
      customer_id: z.uuid("Select a customer."),
      vehicle_id: z.uuid("Select a vehicle."),
      start_at: z.string().min(1, "Start date and time is required."),
      expected_return_at: z.string().min(1, "Expected return is required."),
      actual_return_at: optionalText(40),
      pickup_location: optionalText(200),
      return_location: optionalText(200),
      starting_odometer: optionalNumber(),
      ending_odometer: optionalNumber(),
      starting_fuel_level: optionalNumber().pipe(
        z.number().max(100).optional(),
      ),
      ending_fuel_level: optionalNumber().pipe(z.number().max(100).optional()),
      status: z
        .enum([
          "draft",
          "reserved",
          "active",
          "completed",
          "cancelled",
          "overdue",
        ])
        .optional(),
      tracking_consent_at: optionalText(40),
      notes: optionalText(),
    })
    .refine(
      (value) =>
        new Date(value.expected_return_at).getTime() >
        new Date(value.start_at).getTime(),
      {
        path: ["expected_return_at"],
        message: "Expected return must be after the rental start.",
      },
    ),
  fields: [
    {
      name: "reference_number",
      label: "Reference number",
      required: true,
      placeholder: "RNT-260715-001",
    },
    {
      name: "customer_id",
      label: "Customer",
      type: "select",
      required: true,
      reference: {
        table: "customers",
        labelColumn: "full_name",
        secondaryColumn: "phone_number",
      },
    },
    {
      name: "vehicle_id",
      label: "Vehicle",
      type: "select",
      required: true,
      reference: {
        table: "vehicles",
        labelColumn: "plate_number",
        secondaryColumn: "name",
      },
    },
    {
      name: "start_at",
      label: "Start date and time",
      type: "datetime-local",
      required: true,
    },
    {
      name: "expected_return_at",
      label: "Expected return",
      type: "datetime-local",
      required: true,
    },
    {
      name: "actual_return_at",
      label: "Actual return",
      type: "datetime-local",
    },
    { name: "pickup_location", label: "Pickup location" },
    { name: "return_location", label: "Return location" },
    {
      name: "starting_odometer",
      label: "Starting odometer (km)",
      type: "number",
      step: "0.1",
    },
    {
      name: "ending_odometer",
      label: "Ending odometer (km)",
      type: "number",
      step: "0.1",
    },
    {
      name: "starting_fuel_level",
      label: "Starting fuel (%)",
      type: "number",
      step: "0.1",
    },
    {
      name: "ending_fuel_level",
      label: "Ending fuel (%)",
      type: "number",
      step: "0.1",
    },
    {
      name: "tracking_consent_at",
      label: "Tracking consent time",
      type: "datetime-local",
    },
    {
      name: "notes",
      label: "Notes",
      type: "textarea",
      className: "md:col-span-2",
    },
  ],
  columns: [
    { key: "reference_number", label: "Reference" },
    { key: "start_at", label: "Starts", format: "datetime" },
    { key: "expected_return_at", label: "Expected return", format: "datetime" },
    { key: "status", label: "Status", format: "status" },
    { key: "updated_at", label: "Updated", format: "datetime" },
  ],
  demoRows: [
    {
      id: "demo-rental",
      reference_number: "RNT-260715-001",
      start_at: "2026-07-15T00:00:00Z",
      expected_return_at: "2026-07-15T10:00:00Z",
      status: "active",
      updated_at: "2026-07-15T01:05:00Z",
    },
  ],
};
