"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { Info, Upload } from "lucide-react";
import { toast } from "sonner";

import { submitPaymentProofAction } from "@/features/booking/actions/submit-payment-proof-action";
import { bookingPaymentStep } from "@/features/booking/lib/booking-payment-step";
import { compressPaymentProof } from "@/features/booking/lib/compress-payment-proof";
import type { BookingPaymentDetails } from "@/features/booking/types/booking-payment";
import { ImageDropzone } from "@/features/shared/components/image-dropzone";
import { formatManila } from "@/features/shared/lib/manila-time";
import { formatPhpExact } from "@/features/shared/lib/money";
import {
  buildRentalBill,
  describeRentLine,
} from "@/features/rentals/lib/rental-bill";
import {
  type DriverTerms,
  driverDayNote,
  driverExtraHoursLine,
  driverLineLabel,
} from "@/features/booking/lib/driver-terms";
import { formatPhp } from "@/features/vehicles/lib/rental-pricing";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

function formatWhen(value: string) {
  if (!Number.isFinite(new Date(value).getTime())) return value;
  return formatManila(value, "stamp");
}

export function BookingPaymentForm({
  booking,
  onlinePayment,
  driverTerms = null,
}: {
  booking: BookingPaymentDetails;
  /** Settings → the hours a driver day covers and overtime, for the driver line. */
  driverTerms?: DriverTerms | null;
  /** PayMongo checkout, shown above the manual QR + proof upload when set up. */
  onlinePayment?: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const step = bookingPaymentStep(booking);
  const canPay = step.kind === "reservation_fee" || step.kind === "open_bill";
  // Once staff took it past the fee, the summary shows the running bill.
  const showRunningBill =
    booking.status !== "draft" &&
    step.kind !== "reservation_fee" &&
    step.kind !== "reservation_fee_sent";
  const extraCharges = Math.round((booking.billTotal - booking.quotedTotal) * 100) / 100;
  const [amount, setAmount] = useState(
    step.kind === "open_bill" ? String(step.payable) : "",
  );
  const [paymentReference, setPaymentReference] = useState(
    booking.paymentReference ?? "",
  );
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  // The trip total split into car, driver and delivery; payments stay off
  // this summary, which shows the fee due and what is left at pick-up.
  const bill = buildRentalBill({
    quotedRates: { daily: booking.quotedDailyRate },
    quotedDays: booking.quotedDays,
    quotedHours: booking.quotedHours,
    quotedTotal: booking.quotedTotal,
    driver: booking.driver,
    handover: booking.handover,
    bookingFees: booking.bookingFees,
    payments: [],
  });
  const extraHours =
    bill.driver?.rate != null ? driverExtraHoursLine(driverTerms) : null;
  const itemized =
    bill.driver !== null || bill.handover.length > 0 || bill.bookingFees.length > 0;

  function onSubmit(formData: FormData) {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      // The dropped file, even if the browser could not write it onto the input.
      if (proofFile) formData.set("proof", proofFile);
      const proof = formData.get("proof");
      if (proof instanceof File && proof.size > 0) {
        try {
          formData.set("proof", await compressPaymentProof(proof));
        } catch {
          setError(
            "Could not process that image. Try a clearer JPEG or PNG screenshot.",
          );
          setFieldErrors({
            proof: ["Could not process that image. Try another screenshot."],
          });
          return;
        }
      }

      const result = await submitPaymentProofAction(formData);
      if (!result.success) {
        setError(result.message);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      setProofFile(null);
      toast.success(result.data?.message ?? "Payment proof sent.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5 text-left">
        <p className="text-xs font-semibold tracking-wider text-teal-700 uppercase">
          Reference
        </p>
        <p className="mt-1 text-2xl font-bold text-brand-950">
          {booking.referenceNumber}
        </p>
        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Vehicle</dt>
            <dd className="font-medium text-brand-950">{booking.vehicleName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Pick-up</dt>
            <dd className="text-right font-medium text-brand-950">
              {formatWhen(booking.startAt)}
              {booking.pickupLocation ? (
                <span className="block text-xs font-normal text-muted-foreground">
                  {booking.pickupLocation}
                </span>
              ) : null}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Return</dt>
            <dd className="text-right font-medium text-brand-950">
              {formatWhen(booking.expectedReturnAt)}
              {booking.returnLocation ? (
                <span className="block text-xs font-normal text-muted-foreground">
                  {booking.returnLocation}
                </span>
              ) : null}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-border pt-3">
            <dt className="text-muted-foreground">
              {itemized ? "Car rental" : null}
              <span className={itemized ? "block text-xs" : undefined}>
                {describeRentLine(bill.rent)}
              </span>
            </dt>
            <dd className="font-medium text-brand-950 tabular-nums">
              {formatPhp(bill.rent.total)}
            </dd>
          </div>
          {bill.driver ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">
                {driverLineLabel(bill.driver.days)}
                <span className="block text-xs">
                  {bill.driver.rate != null
                    ? driverDayNote(bill.driver.rate, driverTerms)
                    : "Fee confirmed by staff"}
                </span>
              </dt>
              <dd className="font-medium text-brand-950 tabular-nums">
                {formatPhp(bill.driver.fee)}
              </dd>
            </div>
          ) : null}
          {extraHours ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">
                {extraHours.label}
                <span className="block text-xs">{extraHours.detail}</span>
              </dt>
              <dd className="shrink-0 font-medium text-brand-950 tabular-nums">
                {extraHours.amount}
              </dd>
            </div>
          ) : null}
          {bill.handover.map((line) => (
            <div className="flex justify-between gap-4" key={line.label}>
              <dt className="text-muted-foreground">
                {line.label}
                <span className="block text-xs">{line.detail}</span>
              </dt>
              <dd className="font-medium text-brand-950 tabular-nums">
                {line.fee > 0 ? formatPhp(line.fee) : "Free"}
              </dd>
            </div>
          ))}
          {bill.bookingFees.map((fee) => (
            <div className="flex justify-between gap-4" key={fee.name}>
              <dt className="text-muted-foreground">{fee.name}</dt>
              <dd className="font-medium text-brand-950 tabular-nums">
                {formatPhp(fee.amount)}
              </dd>
            </div>
          ))}
          {itemized ? (
            <div className="flex justify-between gap-4">
              <dt className="font-medium text-brand-950">Trip total</dt>
              <dd className="font-semibold text-brand-950 tabular-nums">
                {formatPhp(booking.quotedTotal)}
              </dd>
            </div>
          ) : null}
          {showRunningBill ? (
            <>
              {extraCharges !== 0 ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Extra charges</dt>
                  <dd className="font-medium text-brand-950 tabular-nums">
                    {extraCharges < 0 ? "− " : ""}
                    {formatPhpExact(Math.abs(extraCharges))}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-4 border-t border-border pt-3">
                <dt className="font-medium text-brand-950">Total bill</dt>
                <dd className="font-semibold text-brand-950 tabular-nums">
                  {formatPhpExact(booking.billTotal)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">You paid</dt>
                <dd className="font-medium text-brand-950 tabular-nums">
                  {booking.amountPaid > 0 ? "− " : ""}
                  {formatPhpExact(booking.amountPaid)}
                </dd>
              </div>
              {booking.pendingPaymentAmount > 0 ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Being checked</dt>
                  <dd className="font-medium text-brand-950 tabular-nums">
                    {formatPhpExact(booking.pendingPaymentAmount)}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-4 border-t border-border pt-3">
                <dt className="font-semibold text-brand-950">Open balance</dt>
                <dd className="font-bold text-brand-950 tabular-nums">
                  {formatPhpExact(
                    Math.max(0, booking.billTotal - booking.amountPaid),
                  )}
                </dd>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between gap-4 border-t border-border pt-3">
                <dt className="font-semibold text-brand-950">
                  Reservation fee due
                </dt>
                <dd className="font-bold text-brand-950">
                  {formatPhp(booking.depositAmount)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Balance at pick-up</dt>
                <dd className="font-medium text-brand-950">
                  {formatPhp(booking.balanceDue)}
                </dd>
              </div>
            </>
          )}
        </dl>
      </div>

      {booking.datesTaken ? (
        <Alert className="text-left" variant="destructive">
          <Info />
          <AlertDescription>
            {booking.depositPending
              ? "We received your payment, but another customer secured these dates first. We will contact you to move your dates or refund your payment."
              : "Another customer already paid for these dates. Please don't send a payment for this booking — pick different dates or another car."}
          </AlertDescription>
        </Alert>
      ) : (
        <>
      {step.kind === "reservation_fee" ? onlinePayment : null}

      {canPay ? (
      <div className="rounded-xl border border-border bg-card p-5 text-left">
        <h2 className="text-base font-semibold text-brand-950">
          {onlinePayment && step.kind === "reservation_fee"
            ? "Or pay by QR and upload proof"
            : "How to pay"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {step.kind === "open_bill" ? (
            <>
              Send up to{" "}
              <span className="font-semibold text-brand-950">
                {formatPhpExact(step.payable)}
              </span>{" "}
              — the whole balance or part of it — and put{" "}
            </>
          ) : (
            <>
              Send exactly{" "}
              <span className="font-semibold text-brand-950">
                {formatPhp(booking.depositAmount)}
              </span>{" "}
              and put{" "}
            </>
          )}
          <span className="font-semibold text-brand-950">
            {booking.referenceNumber}
          </span>{" "}
          in the transfer note.
        </p>
        {booking.paymentQrUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt="Payment QR code"
            className="mx-auto mt-4 size-48 rounded-lg border border-border object-contain bg-white p-2"
            src={booking.paymentQrUrl}
          />
        ) : (
          <p className="mt-4 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-4 text-sm text-muted-foreground">
            Payment QR is not set yet. Follow the instructions below or contact
            the shop.
          </p>
        )}
        {booking.paymentInstructions ? (
          <p className="mt-4 whitespace-pre-wrap text-sm text-brand-950">
            {booking.paymentInstructions}
          </p>
        ) : null}
      </div>
      ) : null}

      {!canPay ? (
        <Alert className="border-success/20 bg-success-surface text-left">
          <Info />
          <AlertDescription>
            {step.kind === "reservation_fee_sent"
              ? booking.status === "reserved"
                ? "Payment received. We will confirm your reservation fee shortly."
                : "Payment received — these dates are now held for you. We will confirm your reservation shortly."
              : step.kind === "open_bill_sent"
                ? `Your ${formatPhpExact(step.pending)} payment is being checked. We will update your bill once it is confirmed.`
                : booking.paymentStatus === "paid_in_full"
                  ? "Your bill is fully paid. Thank you!"
                  : "Reservation fee confirmed. Your car is reserved."}
            {step.kind === "reservation_fee_sent" && booking.paymentReference
              ? ` Payment ref: ${booking.paymentReference}.`
              : null}
          </AlertDescription>
        </Alert>
      ) : (
        <form action={onSubmit} className="space-y-4 rounded-xl border border-border bg-card p-5 text-left">
          <input name="rentalId" type="hidden" value={booking.rentalId} />
          <input
            name="referenceNumber"
            type="hidden"
            value={booking.referenceNumber}
          />
          <h2 className="text-base font-semibold text-brand-950">
            Upload payment proof
          </h2>
          {step.kind === "open_bill" ? (
            <Field data-invalid={Boolean(fieldErrors.amount)}>
              <FieldLabel htmlFor="amount">Amount you sent</FieldLabel>
              <Input
                id="amount"
                inputMode="decimal"
                max={step.payable}
                min={0.01}
                name="amount"
                onChange={(event) => setAmount(event.target.value)}
                step={0.01}
                type="number"
                value={amount}
              />
              <FieldDescription>
                Up to {formatPhpExact(step.payable)}
                {step.pending > 0
                  ? ` — ${formatPhpExact(step.pending)} you sent earlier is still being checked.`
                  : "."}
              </FieldDescription>
              {fieldErrors.amount ? (
                <FieldError>{fieldErrors.amount[0]}</FieldError>
              ) : null}
            </Field>
          ) : null}
          <Field data-invalid={Boolean(fieldErrors.paymentReference)}>
            <FieldLabel htmlFor="paymentReference">
              GCash / Maya / bank reference no.
            </FieldLabel>
            <Input
              id="paymentReference"
              name="paymentReference"
              onChange={(event) => setPaymentReference(event.target.value)}
              placeholder="e.g. 1234 5678 9012"
              value={paymentReference}
            />
            {fieldErrors.paymentReference ? (
              <FieldError>{fieldErrors.paymentReference[0]}</FieldError>
            ) : null}
          </Field>
          <Field data-invalid={Boolean(fieldErrors.proof)}>
            <FieldLabel htmlFor="proof">Payment screenshot</FieldLabel>
            <ImageDropzone
              hint="JPEG, PNG, WebP, or GIF up to 5MB. Large images are compressed before upload."
              id="proof"
              invalid={Boolean(fieldErrors.proof)}
              name="proof"
              onFiles={(files) => setProofFile(files[0] ?? null)}
              value={proofFile}
            />
            {fieldErrors.proof ? (
              <FieldError>{fieldErrors.proof[0]}</FieldError>
            ) : null}
          </Field>
          {error ? (
            <Alert variant="destructive">
              <Info />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button
            className="w-full"
            data-contact-fab-avoid=""
            disabled={pending}
            size="lg"
            type="submit"
          >
            {pending ? <Spinner /> : <Upload />}
            {pending ? "Uploading..." : "Submit payment proof"}
          </Button>
        </form>
      )}
        </>
      )}
    </div>
  );
}
