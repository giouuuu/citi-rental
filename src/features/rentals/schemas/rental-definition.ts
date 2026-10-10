import { z } from "zod";
import {
  HOLDING_DRAFT_PAYMENT_STATUSES,
  HOLDING_RENTAL_STATUSES,
} from "@/features/rentals/lib/rental-holds";
import { buildDemoWorkspace } from "@/features/shared/lib/demo-workspace";
import {
  optionalNumber,
  optionalText,
  requiredText,
} from "@/features/shared/schemas/schema-helpers";
import type {
  ResourceDefinition,
  ResourceField,
} from "@/features/shared/types/resource";

/**
 * Money taken while booking at the counter. Not rental columns: the save
 * action records them on the payments ledger, so they only show on create.
 */
export const RENTAL_BOOKING_PAYMENT_FIELDS = [
  "payment_now",
  "payment_amount",
  "payment_method",
  "payment_reference",
] as const;

const NO_PAYMENT_NOW = ["", "none"];

const bookingPaymentFields: ResourceField[] = [
  {
    name: "payment_now",
    label: "Payment received now",
    type: "select",
    options: [
      { value: "none", label: "None yet" },
      { value: "deposit", label: "Down payment" },
      { value: "full", label: "Paid in full" },
    ],
    description:
      "Take a down payment or the full rent while booking. Later payments go on the Bill & payments tab.",
  },
  {
    name: "payment_amount",
    label: "Down payment (PHP)",
    type: "number",
    step: "0.01",
    lockWhen: {
      field: "payment_now",
      values: [...NO_PAYMENT_NOW, "full"],
      message: "Choose Down payment to type an amount. Paid in full uses the rent total.",
    },
  },
  {
    name: "payment_method",
    label: "Paid by",
    type: "select",
    options: [
      { value: "cash", label: "Cash" },
      { value: "gcash", label: "GCash" },
      { value: "maya", label: "Maya" },
      { value: "bank", label: "Bank" },
      { value: "other", label: "Other" },
    ],
    lockWhen: { field: "payment_now", values: NO_PAYMENT_NOW },
  },
  {
    name: "payment_reference",
    label: "Payment reference",
    placeholder: "GCash / bank ref (optional)",
    lockWhen: { field: "payment_now", values: NO_PAYMENT_NOW },
  },
];

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
      payment_now: z.enum(["none", "deposit", "full"]).optional(),
      payment_amount: optionalNumber(0),
      payment_method: z.enum(["cash", "gcash", "maya", "bank", "other"]).optional(),
      payment_reference: optionalText(120),
    })
    .refine(
      (value) =>
        value.payment_now !== "deposit" || (value.payment_amount ?? 0) > 0,
      {
        path: ["payment_amount"],
        message: "Enter the down payment amount.",
      },
    )
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
          statuses: HOLDING_RENTAL_STATUSES,
          alsoWhen: {
            status: "draft",
            column: "payment_status",
            values: HOLDING_DRAFT_PAYMENT_STATUSES,
            label: "Deposit sent",
          },
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
        "Leave blank to use the car's rate. Rent is this rate per 24 hours, plus the car's 12-hour or hourly rate for leftover hours. Add car wash, delivery, and other fees on the Bill & payments tab.",
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
    ...bookingPaymentFields,
    {
      name: "notes",
      label: "Notes",
      type: "textarea",
      className: "md:col-span-2",
    },
  ],
  filters: [
    {
      param: "status",
      column: "status",
      op: "eq",
      label: "Status",
      picker: true,
      valueLabels: {
        draft: "Draft",
        reserved: "Reserved",
        active: "Active",
        overdue: "Overdue",
        completed: "Completed",
        cancelled: "Cancelled",
      },
    },
    {
      param: "customer",
      column: "customer_id",
      op: "eq",
      label: "Customer",
      picker: true,
      reference: { table: "customers", labelColumn: "full_name", secondaryColumn: "phone_number" },
    },
    {
      param: "vehicle",
      column: "vehicle_id",
      op: "eq",
      label: "Car",
      picker: true,
      reference: { table: "vehicles", labelColumn: "plate_number", secondaryColumn: "name" },
    },
    // Rentals that touch the range: still out on or after From, starting on or before To.
    { param: "from", column: "expected_return_at", op: "gte", label: "From", timestamp: true, pair: "dates" },
    { param: "to", column: "start_at", op: "lte", label: "To", timestamp: true, pair: "dates" },
  ],
  // Related values stack in one cell so the list fits without sideways
  // scrolling; the export still gets every value as its own column.
  columns: [
    {
      key: "customer_name",
      label: "Customer",
      reference: { table: "customers", column: "full_name" },
      secondary: [{ key: "reference_number", label: "Reference" }],
    },
    {
      key: "vehicle_plate",
      label: "Car",
      reference: { table: "vehicles", column: "plate_number" },
      secondary: [
        { key: "vehicle_name", label: "Car name", reference: { table: "vehicles", column: "name" } },
        { key: "with_driver", label: "With driver", format: "boolean" },
      ],
    },
    {
      key: "start_at",
      label: "Dates",
      format: "datetime",
      secondary: [
        { key: "expected_return_at", label: "Expected return", format: "datetime", prefix: "to" },
      ],
    },
    {
      key: "status",
      label: "Status",
      format: "status",
      secondary: [{ key: "payment_status", label: "Payment", format: "status" }],
    },
    // Computed columns (rental_list_bill_columns migration) read the payments ledger.
    {
      key: "bill_total",
      label: "Bill",
      format: "money",
      secondary: [{ key: "bill_balance", label: "Balance", format: "money", prefix: "Balance" }],
    },
    { key: "amount_paid", label: "Paid", format: "money", exportOnly: true },
    { key: "updated_at", label: "Updated", format: "datetime", exportOnly: true },
  ],
  // Built once per server start; ids are stable so dashboard links resolve.
  // Try the rental agreement with this booking's details, without releasing.
  rowLinks: [
    {
      label: "Preview agreement",
      path: "/agreement/preview",
      icon: "agreement",
      newTab: true,
    },
  ],
  demoRows: demoRentalRows(),
};

/** The demo workspace as list rows, with the bill read off its payments ledger. */
function demoRentalRows() {
  const workspace = buildDemoWorkspace();
  const customers = new Map(workspace.customers.map((customer) => [customer.id, customer]));
  const vehicles = new Map(workspace.vehicles.map((vehicle) => [vehicle.id, vehicle]));
  return workspace.rentals
    .toSorted((a, b) => b.startAt.localeCompare(a.startAt))
    .map((rental) => {
      const payments = workspace.payments.filter((payment) => payment.rentalId === rental.id);
      const sum = (types: string[]) =>
        payments
          .filter((payment) => types.includes(payment.paymentType))
          .reduce((total, payment) => total + payment.amount, 0);
      const billTotal = rental.quotedTotal + sum(["penalty"]);
      const amountPaid = sum(["deposit", "balance", "adjustment"]) - sum(["refund"]);
      const vehicle = vehicles.get(rental.vehicleId);
      return {
        id: rental.id,
        reference_number: rental.referenceNumber,
        customer_id: rental.customerId,
        customer_name: customers.get(rental.customerId)?.fullName ?? null,
        vehicle_id: rental.vehicleId,
        vehicle_plate: vehicle?.plateNumber ?? null,
        vehicle_name: vehicle?.name ?? null,
        start_at: rental.startAt,
        expected_return_at: rental.expectedReturnAt,
        actual_return_at: rental.actualReturnAt,
        pickup_location: rental.pickupLocation,
        status: rental.status,
        bill_total: billTotal,
        amount_paid: amountPaid,
        bill_balance: Math.max(0, billTotal - amountPaid),
        updated_at: rental.createdAt,
      };
    });
}

// The booking payment fields are not rental columns; never select them.
rentalDefinition.detailColumns = rentalDefinition.fields
  .map((field) => field.name)
  .filter(
    (name) =>
      !(RENTAL_BOOKING_PAYMENT_FIELDS as readonly string[]).includes(name),
  );
