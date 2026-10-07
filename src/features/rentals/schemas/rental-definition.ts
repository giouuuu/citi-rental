import { z } from "zod";
import { buildDemoWorkspace } from "@/features/shared/lib/demo-workspace";
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
  writeRoles: ["owner", "admin", "staff"],
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
      destination: optionalText(200),
      quoted_daily_rate: optionalNumber(0),
      passenger_count: optionalNumber(1).pipe(
        z.number().int().max(60).optional(),
      ),
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
      description: "Blocked customers are hidden and cannot be booked.",
      reference: {
        table: "customers",
        labelColumn: "full_name",
        secondaryColumn: "phone_number",
        equals: { is_blocked: false },
      },
    },
    {
      name: "vehicle_id",
      label: "Vehicle",
      type: "select",
      required: true,
      description:
        "Maintenance and inactive cars are hidden. Overlapping reserved/active/overdue bookings are blocked.",
      reference: {
        table: "vehicles",
        labelColumn: "plate_number",
        secondaryColumn: "name",
        statusColumn: "status",
        excludeStatuses: ["maintenance", "inactive"],
      },
    },
    {
      name: "start_at",
      label: "Rental dates",
      type: "date-range",
      required: true,
      description:
        "Click the start day, then the return day. Hatched days are already booked for this car.",
      className: "md:col-span-2",
      lockWhen: {
        field: "status",
        values: ["active", "overdue", "completed", "cancelled"],
        message:
          "Dates are fixed once the car is out. Use Extend to move the return date.",
      },
      range: {
        endField: "expected_return_at",
        startLabel: "Start",
        endLabel: "Expected return",
        blockedBy: {
          field: "vehicle_id",
          table: "rentals",
          labelColumn: "reference_number",
          statuses: ["reserved", "active", "overdue"],
        },
      },
    },
    {
      name: "expected_return_at",
      label: "Expected return",
      type: "datetime-local",
      required: true,
    },
    {
      name: "quoted_daily_rate",
      label: "Daily rate (PHP)",
      type: "number",
      step: "0.01",
      description:
        "Leave blank to use the car's rate. Rent is this rate × the booked days. Add car wash, delivery, and other fees on the Bill & payments tab.",
    },
    {
      name: "actual_return_at",
      label: "Actual return",
      type: "datetime-local",
    },
    { name: "pickup_location", label: "Pickup location" },
    { name: "return_location", label: "Return location" },
    { name: "destination", label: "Destination" },
    {
      name: "passenger_count",
      label: "Passengers",
      type: "number",
      step: "1",
    },
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
    { key: "payment_status", label: "Payment", format: "status" },
    { key: "updated_at", label: "Updated", format: "datetime" },
  ],
  // Built once per server start; ids are stable so dashboard links resolve.
  demoRows: buildDemoWorkspace()
    .rentals.toSorted((a, b) => b.startAt.localeCompare(a.startAt))
    .map((rental) => ({
      id: rental.id,
      reference_number: rental.referenceNumber,
      customer_id: rental.customerId,
      vehicle_id: rental.vehicleId,
      start_at: rental.startAt,
      expected_return_at: rental.expectedReturnAt,
      actual_return_at: rental.actualReturnAt,
      pickup_location: rental.pickupLocation,
      status: rental.status,
      updated_at: rental.createdAt,
    })),
};
