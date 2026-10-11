import {
  describeRent,
  driverDays,
  quoteRent,
  type RentRates,
} from "@/features/rentals/lib/rent-pricing";
import { driverCharge, rentalQuoteColumns } from "@/features/rentals/lib/rental-quote";
import { parseManilaDateTimeInput } from "@/features/shared/lib/manila-time";

/**
 * Recording a rental that already happened. The form, its preview, and the
 * server action all run `planPastRental`, so the numbers the owner confirms in
 * the preview are the numbers `record_past_rental` saves.
 */

export const PAYMENT_METHODS = ["cash", "gcash", "maya", "bank", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  gcash: "GCash",
  maya: "Maya",
  bank: "Bank",
  other: "Other",
};

/** What the form holds: picker strings (`YYYY-MM-DDTHH:mm`, Manila) and typed numbers. */
export type PastRentalInput = {
  referenceNumber: string;
  customerId: string;
  vehicleId: string;
  bookedAt: string;
  startAt: string;
  expectedReturnAt: string;
  actualReturnAt: string;
  withDriver: boolean;
  dailyRate: string;
  driverFee: string;
  totalCharged: string;
  amountPaid: string;
  paymentMethod: string;
  paidAt: string;
  paymentReference: string;
  pickupLocation: string;
  returnLocation: string;
  destination: string;
  startingOdometer: string;
  endingOdometer: string;
  notes: string;
};

export type PastRentalField = keyof PastRentalInput;

export const EMPTY_PAST_RENTAL: PastRentalInput = {
  referenceNumber: "",
  customerId: "",
  vehicleId: "",
  bookedAt: "",
  startAt: "",
  expectedReturnAt: "",
  actualReturnAt: "",
  withDriver: false,
  dailyRate: "",
  driverFee: "",
  totalCharged: "",
  amountPaid: "",
  paymentMethod: "cash",
  paidAt: "",
  paymentReference: "",
  pickupLocation: "",
  returnLocation: "",
  destination: "",
  startingOdometer: "",
  endingOdometer: "",
  notes: "",
};

export type PastRentalCar = {
  id: string;
  plateNumber: string;
  name: string | null;
  dailyRate: number | null;
  halfDayRate: number | null;
  hourlyRate: number | null;
};

export type PastRentalPreview = {
  startAt: string;
  expectedReturnAt: string;
  actualReturnAt: string;
  bookedAt: string;
  /** How the rent was priced, e.g. "₱1,500 × 2 days"; null when the total was typed. */
  rentDescription: string | null;
  rent: number | null;
  driverFee: number;
  total: number;
  totalIsCustom: boolean;
  paid: number;
  balance: number;
  paidAt: string | null;
  paymentMethod: PaymentMethod | null;
  /** Hours past the agreed return, when more than the 1-hour grace. */
  lateHours: number | null;
  tripHours: number;
};

/** Arguments of `record_past_rental`, minus `p_acknowledged`. */
export type PastRentalRpcArgs = {
  p_reference_number: string;
  p_customer_id: string;
  p_vehicle_id: string;
  p_booked_at: string;
  p_start_at: string;
  p_expected_return_at: string;
  p_actual_return_at: string;
  p_with_driver: boolean;
  p_quoted_daily_rate: number | null;
  p_quoted_half_day_rate: number | null;
  p_quoted_hourly_rate: number | null;
  p_quoted_days: number | null;
  p_quoted_hours: number | null;
  p_quoted_total: number;
  p_driver_daily_rate: number | null;
  p_driver_days: number | null;
  p_driver_fee: number;
  p_pickup_location: string | null;
  p_return_location: string | null;
  p_destination: string | null;
  p_starting_odometer: number | null;
  p_ending_odometer: number | null;
  p_notes: string | null;
  p_amount_paid: number;
  p_payment_method: PaymentMethod | null;
  p_payment_reference: string | null;
  p_paid_at: string | null;
};

export type PastRentalPlan =
  | { ok: true; args: PastRentalRpcArgs; preview: PastRentalPreview }
  | { ok: false; fieldErrors: Partial<Record<PastRentalField, string>> };

const HOUR_MS = 3_600_000;
const LATE_GRACE_HOURS = 1;

const round2 = (value: number) => Math.round(value * 100) / 100;
const text = (value: string) => value.trim() || null;

/**
 * Validates the form and prices it: rent on the agreed pickup → return time
 * (the same rule as a new rental), plus the driver, unless the owner typed the
 * total they actually charged.
 */
export function planPastRental(
  input: PastRentalInput,
  context: { car: PastRentalCar | null; driverDailyRate: number | null; now: Date },
): PastRentalPlan {
  const errors: Partial<Record<PastRentalField, string>> = {};
  const number = (field: PastRentalField, options: { min?: number } = {}) => {
    const raw = String(input[field]).trim().replaceAll(",", "");
    if (!raw) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < (options.min ?? 0)) {
      errors[field] = "Enter a valid amount.";
      return null;
    }
    return value;
  };
  const time = (field: PastRentalField, label: string, required: boolean) => {
    const raw = String(input[field]);
    if (!raw) {
      if (required) errors[field] = `Enter the ${label} date and time.`;
      return null;
    }
    const value = parseManilaDateTimeInput(raw);
    if (!value) errors[field] = `Enter the ${label} date and time.`;
    return value;
  };

  const reference = input.referenceNumber.trim();
  if (!reference) errors.referenceNumber = "Enter a reference number.";
  else if (reference.length > 60) errors.referenceNumber = "Keep it under 60 characters.";
  if (!input.customerId) errors.customerId = "Select the customer.";
  if (!input.vehicleId || !context.car) errors.vehicleId = "Select the car.";

  const startAt = time("startAt", "pickup", true);
  const expectedReturnAt = time("expectedReturnAt", "agreed return", true);
  const actualReturnAt = time("actualReturnAt", "actual return", true);
  const bookedAt = time("bookedAt", "booking", false) ?? startAt;
  const now = context.now.getTime();

  if (startAt && startAt.getTime() > now) errors.startAt = "A past rental's pickup can't be in the future.";
  if (startAt && expectedReturnAt && expectedReturnAt <= startAt)
    errors.expectedReturnAt = "The agreed return must be after the pickup.";
  if (startAt && actualReturnAt && actualReturnAt <= startAt)
    errors.actualReturnAt = "The actual return must be after the pickup.";
  if (actualReturnAt && actualReturnAt.getTime() > now)
    errors.actualReturnAt = "The car must already be back. For a car still out, use New rental.";
  if (bookedAt && startAt && bookedAt > startAt)
    errors.bookedAt = "The booking can't be after the pickup.";

  const enteredRate = number("dailyRate");
  const enteredDriverFee = number("driverFee");
  const enteredTotal = number("totalCharged");
  const paid = number("amountPaid") ?? 0;
  const startingOdometer = number("startingOdometer");
  const endingOdometer = number("endingOdometer");
  if (startingOdometer !== null && endingOdometer !== null && endingOdometer < startingOdometer)
    errors.endingOdometer = "Can't be lower than the starting odometer.";

  const car = context.car;
  const daily = enteredRate ?? car?.dailyRate ?? null;
  const rates: RentRates | null =
    daily === null ? null : { daily, halfDay: car?.halfDayRate ?? null, hourly: car?.hourlyRate ?? null };
  if (!rates && enteredTotal === null && !errors.dailyRate)
    errors.dailyRate = "This car has no daily rate. Enter the rate, or the total charged.";

  const method = PAYMENT_METHODS.includes(input.paymentMethod as PaymentMethod)
    ? (input.paymentMethod as PaymentMethod)
    : null;
  const paidAt = paid > 0 ? time("paidAt", "payment", true) : null;
  if (paid > 0 && !method) errors.paymentMethod = "Choose how the customer paid.";
  if (paidAt && paidAt.getTime() > now) errors.paidAt = "The payment date can't be in the future.";

  if (Object.keys(errors).length || !startAt || !expectedReturnAt || !actualReturnAt || !bookedAt || !car) {
    return { ok: false, fieldErrors: errors };
  }

  const quote = rates ? quoteRent(startAt, expectedReturnAt, rates) : null;
  const columns = quote && rates ? rentalQuoteColumns(quote, rates) : null;
  const driver = input.withDriver
    ? enteredDriverFee !== null
      ? { driver_days: driverDays(startAt, expectedReturnAt), driver_fee: round2(enteredDriverFee) }
      : driverCharge(startAt, expectedReturnAt, context.driverDailyRate)
    : null;
  const driverFee = driver?.driver_fee ?? 0;
  const computedTotal = columns ? round2(columns.quoted_total + driverFee) : null;
  const total = enteredTotal !== null ? round2(enteredTotal) : (computedTotal ?? 0);

  if (paid > total) {
    return { ok: false, fieldErrors: { amountPaid: "More than the total charged." } };
  }

  const lateHours = (actualReturnAt.getTime() - expectedReturnAt.getTime()) / HOUR_MS;
  const preview: PastRentalPreview = {
    startAt: startAt.toISOString(),
    expectedReturnAt: expectedReturnAt.toISOString(),
    actualReturnAt: actualReturnAt.toISOString(),
    bookedAt: bookedAt.toISOString(),
    rentDescription: quote && rates && enteredTotal === null ? describeRent(quote, rates) : null,
    rent: columns?.quoted_total ?? null,
    driverFee,
    total,
    totalIsCustom: enteredTotal !== null && enteredTotal !== computedTotal,
    paid: round2(paid),
    balance: round2(Math.max(0, total - paid)),
    paidAt: paidAt?.toISOString() ?? null,
    paymentMethod: paid > 0 ? method : null,
    lateHours: lateHours > LATE_GRACE_HOURS ? Math.round(lateHours * 10) / 10 : null,
    tripHours: Math.round(((actualReturnAt.getTime() - startAt.getTime()) / HOUR_MS) * 10) / 10,
  };

  return {
    ok: true,
    preview,
    args: {
      p_reference_number: reference,
      p_customer_id: input.customerId,
      p_vehicle_id: car.id,
      p_booked_at: preview.bookedAt,
      p_start_at: preview.startAt,
      p_expected_return_at: preview.expectedReturnAt,
      p_actual_return_at: preview.actualReturnAt,
      p_with_driver: input.withDriver,
      p_quoted_daily_rate: columns?.quoted_daily_rate ?? null,
      p_quoted_half_day_rate: columns?.quoted_half_day_rate ?? null,
      p_quoted_hourly_rate: columns?.quoted_hourly_rate ?? null,
      p_quoted_days: columns?.quoted_days ?? null,
      p_quoted_hours: columns?.quoted_hours ?? null,
      p_quoted_total: total,
      p_driver_daily_rate: input.withDriver ? context.driverDailyRate : null,
      p_driver_days: driver?.driver_days ?? null,
      p_driver_fee: driverFee,
      p_pickup_location: text(input.pickupLocation),
      p_return_location: text(input.returnLocation),
      p_destination: text(input.destination),
      p_starting_odometer: startingOdometer,
      p_ending_odometer: endingOdometer,
      p_notes: text(input.notes),
      p_amount_paid: preview.paid,
      p_payment_method: preview.paymentMethod,
      p_payment_reference: paid > 0 ? text(input.paymentReference) : null,
      p_paid_at: preview.paidAt,
    },
  };
}
