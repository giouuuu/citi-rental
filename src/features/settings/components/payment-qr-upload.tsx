"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  removePaymentQrAction,
  uploadPaymentQrAction,
} from "@/features/settings/actions/payment-qr-action";
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";
import { ImageDropzone } from "@/features/shared/components/image-dropzone";

/**
 * The GCash/Maya/bank QR renters scan on the booking pay page. Saves on its
 * own the moment a file is picked, apart from the settings form's Save.
 */
export function PaymentQrUpload({ qrUrl }: { qrUrl: string }) {
  const { isPending, runMutation } = useMutationCoordinator();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function upload(files: File[]) {
    const file = files[0];
    if (!file) return;
    setError(null);
    setBusy("Uploading…");
    runMutation(async () => {
      const formData = new FormData();
      formData.set("file", file);
      const result = await uploadPaymentQrAction(formData);
      setBusy(null);
      if (!result.success) {
        setError(result.message ?? "The QR could not be uploaded.");
        return;
      }
      toast.success(qrUrl ? "Payment QR replaced." : "Payment QR uploaded.");
      router.refresh();
    });
  }

  function remove() {
    setError(null);
    runMutation(async () => {
      const result = await removePaymentQrAction();
      if (!result.success) {
        setError(result.message ?? "The QR could not be removed.");
        return;
      }
      toast.success("Payment QR removed.");
      router.refresh();
    });
  }

  return (
    <Field className="md:col-span-2">
      <FieldLabel htmlFor="payment_qr_file">Payment QR</FieldLabel>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {qrUrl ? (
          <div className="flex shrink-0 flex-col items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="Current payment QR"
              className="size-40 rounded-lg border border-border bg-white object-contain p-2"
              src={qrUrl}
            />
            <Button
              disabled={isPending}
              onClick={remove}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Trash2 /> Remove
            </Button>
          </div>
        ) : null}
        <ImageDropzone
          busy={busy}
          className="min-w-0 flex-1"
          disabled={isPending}
          hint="JPEG, PNG, WebP or GIF, up to 5MB."
          id="payment_qr_file"
          invalid={Boolean(error)}
          noun={qrUrl ? "a new QR" : "your QR"}
          onFiles={upload}
        />
      </div>
      <FieldDescription>
        Your GCash, Maya or bank QR. Renters scan it on the booking pay page to
        send the reservation fee. Saved as soon as you upload it.
      </FieldDescription>
      {error ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </Field>
  );
}
