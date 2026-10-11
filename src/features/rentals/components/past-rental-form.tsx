"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CircleAlert, ClipboardCheck, Info } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { DateTimePicker } from "@/components/ui/date-picker";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { recordPastRentalAction } from "@/features/rentals/actions/record-past-rental-action";
import {
  EMPTY_PAST_RENTAL,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  planPastRental,
  type PastRentalCar,
  type PastRentalField,
  type PastRentalInput,
  type PastRentalPreview,
} from "@/features/rentals/lib/past-rental";
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";
import { formatManila } from "@/features/shared/lib/manila-time";
import { formatPhpExact } from "@/features/shared/lib/money";

type CustomerOption = { id: string; fullName: string; phoneNumber: string | null };
type Errors = Partial<Record<PastRentalField, string>>;

const SERVICE_OPTIONS = [
  { value: "self", label: "Self-drive" },
  { value: "driver", label: "With driver" },
];

function formatDuration(hours: number) {
  const days = Math.floor(hours / 24);
  const rest = Math.round(hours - days * 24);
  const parts = [];
  if (days) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  if (rest) parts.push(`${rest} ${rest === 1 ? "hour" : "hours"}`);
  return parts.join(" ") || "under an hour";
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="grid items-start gap-4 md:grid-cols-2">{children}</CardContent>
    </Card>
  );
}

/**
 * Two steps: fill in the rental, then a read-only preview of exactly what will
 * be saved. Saving needs the owner to tick that they checked it.
 */
export function PastRentalForm({
  customers,
  cars,
  driverDailyRate,
  defaultReference,
}: {
  customers: CustomerOption[];
  cars: PastRentalCar[];
  driverDailyRate: number | null;
  defaultReference: string;
}) {
  const router = useRouter();
  const { isPending, runMutation } = useMutationCoordinator();
  const [values, setValues] = useState<PastRentalInput>({ ...EMPTY_PAST_RENTAL, referenceNumber: defaultReference });
  const [errors, setErrors] = useState<Errors>({});
  const [preview, setPreview] = useState<PastRentalPreview | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [formError, setFormError] = useState("");

  const car = cars.find((option) => option.id === values.vehicleId) ?? null;
  const customer = customers.find((option) => option.id === values.customerId) ?? null;

  function set<K extends PastRentalField>(key: K, value: PastRentalInput[K]) {
    setValues((current) => {
      const next = { ...current, [key]: value };
      // Most trips come back on time, and most are paid at pickup.
      if (key === "expectedReturnAt" && !current.actualReturnAt) next.actualReturnAt = value as string;
      if (key === "startAt" && !current.paidAt) next.paidAt = value as string;
      return next;
    });
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function plan() {
    return planPastRental(values, { car, driverDailyRate, now: new Date() });
  }

  function showPreview(event: React.FormEvent) {
    event.preventDefault();
    const result = plan();
    if (!result.ok) {
      setErrors(result.fieldErrors);
      setFormError("Fix the highlighted fields to see the preview.");
      return;
    }
    setErrors({});
    setFormError("");
    setAcknowledged(false);
    setPreview(result.preview);
    window.scrollTo({ top: 0 });
  }

  function save() {
    if (!preview || !acknowledged) return;
    runMutation(async () => {
      const result = await recordPastRentalAction(values, { acknowledged, previewTotal: preview.total });
      if (!result.success) {
        setFormError(result.message);
        if (result.fieldErrors) {
          setErrors(
            Object.fromEntries(
              Object.entries(result.fieldErrors).map(([key, messages]) => [key, messages?.[0]]),
            ) as Errors,
          );
          setPreview(null);
        }
        return;
      }
      toast.success("Past rental saved as completed.");
      router.push(result.data?.href ?? "/rentals");
    });
  }

  const fieldError = (key: PastRentalField) =>
    errors[key] ? <FieldError errors={[{ message: errors[key] }]} /> : null;
  const invalid = (key: PastRentalField) => (errors[key] ? true : undefined);

  if (preview) {
    return (
      <PastRentalPreviewStep
        acknowledged={acknowledged}
        car={car}
        customer={customer}
        formError={formError}
        isPending={isPending}
        onAcknowledged={setAcknowledged}
        onBack={() => {
          setPreview(null);
          setFormError("");
        }}
        onSave={save}
        preview={preview}
        values={values}
      />
    );
  }

  const computedRent = (() => {
    // The price only needs the car, dates, and rates; ignore the rest.
    const result = planPastRental(
      { ...values, customerId: "_", referenceNumber: "_", totalCharged: "", amountPaid: "" },
      { car, driverDailyRate, now: new Date() },
    );
    return result.ok ? result.preview : null;
  })();

  return (
    <form className="space-y-6" noValidate onSubmit={showPreview}>
      {formError ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <Section title="Customer and car">
        <Field data-invalid={invalid("customerId")}>
          <FieldLabel htmlFor="past-customer">Customer</FieldLabel>
          <Combobox
            aria-invalid={invalid("customerId")}
            id="past-customer"
            onValueChange={(value) => set("customerId", value)}
            options={customers.map((option) => ({
              value: option.id,
              label: option.fullName,
              description: option.phoneNumber ?? undefined,
              keywords: option.phoneNumber ? [option.phoneNumber] : undefined,
            }))}
            placeholder="Select the customer"
            value={values.customerId}
          />
          <FieldDescription>Not listed? Add them under Customers first.</FieldDescription>
          {fieldError("customerId")}
        </Field>
        <Field data-invalid={invalid("vehicleId")}>
          <FieldLabel htmlFor="past-car">Car</FieldLabel>
          <Combobox
            aria-invalid={invalid("vehicleId")}
            id="past-car"
            onValueChange={(value) => set("vehicleId", value)}
            options={cars.map((option) => ({
              value: option.id,
              label: option.plateNumber,
              description: option.name ?? undefined,
              keywords: option.name ? [option.name] : undefined,
            }))}
            placeholder="Select the car"
            value={values.vehicleId}
          />
          {fieldError("vehicleId")}
        </Field>
        <Field data-invalid={invalid("referenceNumber")}>
          <FieldLabel htmlFor="past-reference">Reference number</FieldLabel>
          <Input
            aria-invalid={invalid("referenceNumber")}
            id="past-reference"
            onChange={(event) => set("referenceNumber", event.target.value)}
            value={values.referenceNumber}
          />
          <FieldDescription>Use the number from your logbook or receipt if it had one.</FieldDescription>
          {fieldError("referenceNumber")}
        </Field>
      </Section>

      <Section description="Manila time. The rent is priced on the agreed pickup and return." title="Dates">
        <Field data-invalid={invalid("startAt")}>
          <FieldLabel htmlFor="past-start">Pickup</FieldLabel>
          <DateTimePicker
            aria-invalid={invalid("startAt")}
            id="past-start"
            onValueChange={(value) => set("startAt", value)}
            value={values.startAt}
          />
          {fieldError("startAt")}
        </Field>
        <Field data-invalid={invalid("expectedReturnAt")}>
          <FieldLabel htmlFor="past-expected">Agreed return</FieldLabel>
          <DateTimePicker
            aria-invalid={invalid("expectedReturnAt")}
            id="past-expected"
            onValueChange={(value) => set("expectedReturnAt", value)}
            value={values.expectedReturnAt}
          />
          {fieldError("expectedReturnAt")}
        </Field>
        <Field data-invalid={invalid("actualReturnAt")}>
          <FieldLabel htmlFor="past-actual">Actual return</FieldLabel>
          <DateTimePicker
            aria-invalid={invalid("actualReturnAt")}
            id="past-actual"
            onValueChange={(value) => set("actualReturnAt", value)}
            value={values.actualReturnAt}
          />
          <FieldDescription>When the car really came back. Filled with the agreed return; change it if it was late or early.</FieldDescription>
          {fieldError("actualReturnAt")}
        </Field>
        <Field data-invalid={invalid("bookedAt")}>
          <FieldLabel htmlFor="past-booked">Booked on (optional)</FieldLabel>
          <DateTimePicker
            aria-invalid={invalid("bookedAt")}
            id="past-booked"
            onValueChange={(value) => set("bookedAt", value)}
            value={values.bookedAt}
          />
          <FieldDescription>When the customer booked. Leave blank to use the pickup — Analytics counts the booking on this date.</FieldDescription>
          {fieldError("bookedAt")}
        </Field>
      </Section>

      <Section title="Price">
        <Field>
          <FieldLabel htmlFor="past-service">Service</FieldLabel>
          <Combobox
            id="past-service"
            onValueChange={(value) => set("withDriver", value === "driver")}
            options={SERVICE_OPTIONS}
            value={values.withDriver ? "driver" : "self"}
          />
        </Field>
        <Field data-invalid={invalid("dailyRate")}>
          <FieldLabel htmlFor="past-rate">Daily rate (PHP)</FieldLabel>
          <Input
            aria-invalid={invalid("dailyRate")}
            id="past-rate"
            inputMode="decimal"
            onChange={(event) => set("dailyRate", event.target.value)}
            placeholder={car?.dailyRate != null ? String(car.dailyRate) : "e.g. 1500"}
            type="number"
            value={values.dailyRate}
          />
          <FieldDescription>Leave blank to use the car&apos;s rate{car?.dailyRate != null ? ` (${formatPhpExact(car.dailyRate)})` : ""}.</FieldDescription>
          {fieldError("dailyRate")}
        </Field>
        {values.withDriver ? (
          <Field data-invalid={invalid("driverFee")}>
            <FieldLabel htmlFor="past-driver">Driver fee (PHP)</FieldLabel>
            <Input
              aria-invalid={invalid("driverFee")}
              id="past-driver"
              inputMode="decimal"
              onChange={(event) => set("driverFee", event.target.value)}
              placeholder={computedRent ? String(computedRent.driverFee) : undefined}
              type="number"
              value={values.driverFee}
            />
            <FieldDescription>
              Leave blank to use {driverDailyRate != null ? `${formatPhpExact(driverDailyRate)} a day` : "the driver rate in Settings"}.
            </FieldDescription>
            {fieldError("driverFee")}
          </Field>
        ) : null}
        <Field data-invalid={invalid("totalCharged")}>
          <FieldLabel htmlFor="past-total">Total charged (if different)</FieldLabel>
          <Input
            aria-invalid={invalid("totalCharged")}
            id="past-total"
            inputMode="decimal"
            onChange={(event) => set("totalCharged", event.target.value)}
            placeholder={computedRent ? String(computedRent.total) : undefined}
            type="number"
            value={values.totalCharged}
          />
          <FieldDescription>
            {computedRent
              ? `Priced at ${formatPhpExact(computedRent.total)}. Type what the customer actually paid for the rental if you gave a discount.`
              : "Fill in the dates to see the price."}
          </FieldDescription>
          {fieldError("totalCharged")}
        </Field>
      </Section>

      <Section description="Leave the amount blank if nothing was paid yet — the balance will show as owed." title="Payment received">
        <Field data-invalid={invalid("amountPaid")}>
          <FieldLabel htmlFor="past-paid">Amount paid (PHP)</FieldLabel>
          <Input
            aria-invalid={invalid("amountPaid")}
            id="past-paid"
            inputMode="decimal"
            onChange={(event) => set("amountPaid", event.target.value)}
            placeholder="0"
            type="number"
            value={values.amountPaid}
          />
          {fieldError("amountPaid")}
        </Field>
        <Field data-invalid={invalid("paymentMethod")}>
          <FieldLabel htmlFor="past-method">Paid by</FieldLabel>
          <Combobox
            id="past-method"
            onValueChange={(value) => set("paymentMethod", value)}
            options={PAYMENT_METHODS.map((method) => ({ value: method, label: PAYMENT_METHOD_LABELS[method] }))}
            value={values.paymentMethod}
          />
          {fieldError("paymentMethod")}
        </Field>
        <Field data-invalid={invalid("paidAt")}>
          <FieldLabel htmlFor="past-paid-at">Paid on</FieldLabel>
          <DateTimePicker
            aria-invalid={invalid("paidAt")}
            id="past-paid-at"
            onValueChange={(value) => set("paidAt", value)}
            value={values.paidAt}
          />
          <FieldDescription>Revenue and the finance statement count it on this date.</FieldDescription>
          {fieldError("paidAt")}
        </Field>
        <Field>
          <FieldLabel htmlFor="past-payment-ref">Payment reference (optional)</FieldLabel>
          <Input
            id="past-payment-ref"
            onChange={(event) => set("paymentReference", event.target.value)}
            placeholder="GCash or bank reference"
            value={values.paymentReference}
          />
        </Field>
      </Section>

      <Section title="Trip details (optional)">
        <Field>
          <FieldLabel htmlFor="past-pickup-location">Pickup location</FieldLabel>
          <Input id="past-pickup-location" onChange={(event) => set("pickupLocation", event.target.value)} value={values.pickupLocation} />
        </Field>
        <Field>
          <FieldLabel htmlFor="past-return-location">Return location</FieldLabel>
          <Input id="past-return-location" onChange={(event) => set("returnLocation", event.target.value)} value={values.returnLocation} />
        </Field>
        <Field>
          <FieldLabel htmlFor="past-destination">Destination</FieldLabel>
          <Input id="past-destination" onChange={(event) => set("destination", event.target.value)} value={values.destination} />
        </Field>
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="past-odo-start">Starting odometer (km)</FieldLabel>
            <Input id="past-odo-start" inputMode="decimal" onChange={(event) => set("startingOdometer", event.target.value)} type="number" value={values.startingOdometer} />
          </Field>
          <Field data-invalid={invalid("endingOdometer")}>
            <FieldLabel htmlFor="past-odo-end">Ending odometer (km)</FieldLabel>
            <Input aria-invalid={invalid("endingOdometer")} id="past-odo-end" inputMode="decimal" onChange={(event) => set("endingOdometer", event.target.value)} type="number" value={values.endingOdometer} />
            {fieldError("endingOdometer")}
          </Field>
        </div>
        <Field className="md:col-span-2">
          <FieldLabel htmlFor="past-notes">Notes</FieldLabel>
          <Textarea id="past-notes" onChange={(event) => set("notes", event.target.value)} placeholder="e.g. Entered from the paper logbook" value={values.notes} />
        </Field>
      </Section>

      <div className="flex justify-end">
        <Button type="submit">
          <ClipboardCheck /> Preview before saving
        </Button>
      </div>
    </form>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b py-3 last:border-b-0 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

function PastRentalPreviewStep({
  preview,
  values,
  customer,
  car,
  acknowledged,
  onAcknowledged,
  onBack,
  onSave,
  isPending,
  formError,
}: {
  preview: PastRentalPreview;
  values: PastRentalInput;
  customer: CustomerOption | null;
  car: PastRentalCar | null;
  acknowledged: boolean;
  onAcknowledged: (value: boolean) => void;
  onBack: () => void;
  onSave: () => void;
  isPending: boolean;
  formError: string;
}) {
  const trip = [values.pickupLocation, values.destination, values.returnLocation].map((part) => part.trim());
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Check before saving</CardTitle>
          <CardDescription>This is exactly what will be saved. Go back to change anything.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl>
            <Row label="Customer">
              {customer?.fullName ?? "—"}
              {customer?.phoneNumber ? <span className="block text-xs font-normal text-muted-foreground">{customer.phoneNumber}</span> : null}
            </Row>
            <Row label="Car">
              {car?.plateNumber ?? "—"}
              {car?.name ? <span className="block text-xs font-normal text-muted-foreground">{car.name}</span> : null}
            </Row>
            <Row label="Reference">{values.referenceNumber.trim()}</Row>
            <Row label="Status">
              <Badge variant="secondary">Completed</Badge>
            </Row>
            <Row label="Booked on">{formatManila(preview.bookedAt, "stamp")}</Row>
            <Row label="Pickup">{formatManila(preview.startAt, "stamp")}</Row>
            <Row label="Agreed return">{formatManila(preview.expectedReturnAt, "stamp")}</Row>
            <Row label="Actual return">
              {formatManila(preview.actualReturnAt, "stamp")}
              {preview.lateHours ? (
                <Badge className="ml-2" variant="destructive">
                  {formatDuration(preview.lateHours)} late
                </Badge>
              ) : null}
              <span className="block text-xs font-normal text-muted-foreground">
                Out for {formatDuration(preview.tripHours)}
              </span>
            </Row>
            <Row label="Service">{values.withDriver ? "With driver" : "Self-drive"}</Row>
            <Row label="Rent">
              {preview.rent === null ? "—" : formatPhpExact(preview.rent)}
              {preview.rentDescription ? (
                <span className="block text-xs font-normal text-muted-foreground">{preview.rentDescription}</span>
              ) : null}
            </Row>
            {values.withDriver ? <Row label="Driver fee">{formatPhpExact(preview.driverFee)}</Row> : null}
            <Row label="Total charged">
              <span className="text-base font-semibold">{formatPhpExact(preview.total)}</span>
              {preview.totalIsCustom ? (
                <span className="block text-xs font-normal text-muted-foreground">Typed in — differs from the priced rent</span>
              ) : null}
            </Row>
            <Row label="Paid">
              {preview.paid > 0 && preview.paymentMethod && preview.paidAt
                ? `${formatPhpExact(preview.paid)} · ${PAYMENT_METHOD_LABELS[preview.paymentMethod]} · ${formatManila(preview.paidAt, "stamp")}`
                : "Nothing paid"}
            </Row>
            <Row label="Balance owed">
              <span className={preview.balance > 0 ? "text-destructive" : undefined}>{formatPhpExact(preview.balance)}</span>
            </Row>
            {trip.some(Boolean) ? (
              <Row label="Trip">
                {[trip[0] && `From ${trip[0]}`, trip[1] && `to ${trip[1]}`, trip[2] && `returned at ${trip[2]}`]
                  .filter(Boolean)
                  .join(", ")}
              </Row>
            ) : null}
            {values.startingOdometer || values.endingOdometer ? (
              <Row label="Odometer">
                {values.startingOdometer || "—"} → {values.endingOdometer || "—"} km
              </Row>
            ) : null}
            {values.notes.trim() ? <Row label="Notes">{values.notes.trim()}</Row> : null}
          </dl>
        </CardContent>
      </Card>

      <Alert>
        <Info />
        <AlertTitle>What saving does</AlertTitle>
        <AlertDescription>
          <ul className="list-disc space-y-1 pl-4">
            <li>Saves the rental as completed, with the dates above.</li>
            <li>No pickup or return inspection will be on record, and the customer gets no emails.</li>
            {preview.paid > 0 ? <li>Records the payment on the date it was paid.</li> : null}
            {preview.balance > 0 ? (
              <li>The {formatPhpExact(preview.balance)} balance will show under Needs attention until it is paid.</li>
            ) : null}
            {preview.lateHours ? (
              <li>If you charged for the late return, add a Late return charge on the rental&apos;s bill after saving.</li>
            ) : null}
          </ul>
        </AlertDescription>
      </Alert>

      {formError ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <label className="flex items-start gap-2.5 rounded-lg border border-border bg-card p-3 text-sm">
        <Checkbox checked={acknowledged} onCheckedChange={(value) => onAcknowledged(value === true)} />
        <span>
          I checked these details and confirm this rental already happened as shown.
          <span className="text-destructive"> *</span>
        </span>
      </label>

      <div className="flex flex-wrap justify-between gap-2">
        <Button disabled={isPending} onClick={onBack} type="button" variant="outline">
          <ArrowLeft /> Back to edit
        </Button>
        <Button disabled={!acknowledged || isPending} onClick={onSave} type="button">
          Save past rental
        </Button>
      </div>
    </div>
  );
}
