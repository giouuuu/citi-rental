"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Info, Upload } from "lucide-react";

import { submitPaymentProofAction } from "@/features/booking/actions/submit-payment-proof-action";
import { compressPaymentProof } from "@/features/booking/lib/compress-payment-proof";
import type { BookingPaymentDetails } from "@/features/booking/types/booking-payment";
import { formatPhp } from "@/features/vehicles/lib/rental-pricing";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

function formatWhen(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function BookingPaymentForm({
  booking,
}: {
  booking: BookingPaymentDetails;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [paymentReference, setPaymentReference] = useState(
    booking.paymentReference ?? "",
  );
  const [proofName, setProofName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const alreadySubmitted =
    booking.paymentStatus === "proof_submitted" ||
    booking.paymentStatus === "deposit_paid" ||
    booking.paymentStatus === "paid_in_full" ||
    booking.status !== "draft";

  function onSubmit(formData: FormData) {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
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
            <dd className="font-medium text-brand-950">
              {formatWhen(booking.startAt)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Return</dt>
            <dd className="font-medium text-brand-950">
              {formatWhen(booking.expectedReturnAt)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">
              {booking.quotedDays} day{booking.quotedDays === 1 ? "" : "s"} ×{" "}
              {formatPhp(booking.quotedDailyRate)}
            </dt>
            <dd className="font-medium text-brand-950">
              {formatPhp(booking.quotedTotal)}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-border pt-3">
            <dt className="font-semibold text-brand-950">
              Deposit due ({booking.depositPercent}%)
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
        </dl>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 text-left">
        <h2 className="text-base font-semibold text-brand-950">
          How to pay
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Send exactly{" "}
          <span className="font-semibold text-brand-950">
            {formatPhp(booking.depositAmount)}
          </span>{" "}
          and put{" "}
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

      {alreadySubmitted ? (
        <Alert className="border-success/20 bg-success-surface text-left">
          <Info />
          <AlertDescription>
            {booking.paymentStatus === "deposit_paid" ||
            booking.status === "reserved"
              ? "Deposit confirmed. Your car is reserved."
              : "Payment proof received. We will confirm your reservation shortly."}
            {booking.paymentReference
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
            <Input
              accept="image/jpeg,image/png,image/webp,image/gif"
              id="proof"
              name="proof"
              onChange={(event) =>
                setProofName(event.target.files?.[0]?.name ?? null)
              }
              type="file"
            />
            <p className="text-xs text-muted-foreground">
              JPEG, PNG, WebP, or GIF up to 5MB. Large images are compressed
              before upload.
              {proofName ? ` Selected: ${proofName}` : null}
            </p>
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
          <Button className="w-full" disabled={pending} size="lg" type="submit">
            {pending ? <Spinner /> : <Upload />}
            {pending ? "Uploading..." : "Submit payment proof"}
          </Button>
        </form>
      )}
    </div>
  );
}
