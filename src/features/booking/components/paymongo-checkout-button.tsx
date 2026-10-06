"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { CreditCard, Info } from "lucide-react";

import { startPaymongoCheckoutAction } from "@/features/booking/actions/start-paymongo-checkout-action";
import { formatPhp } from "@/features/vehicles/lib/rental-pricing";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

const POLL_MS = 4000;
const POLL_LIMIT = 15;

export type PaymongoReturn = "success" | "cancelled" | null;

/**
 * Sends the customer to PayMongo's hosted checkout. Coming back with
 * `?paymongo=success` before the webhook lands, the page refreshes itself for
 * about a minute until the payment shows up.
 */
export function PaymongoCheckoutButton({
  rentalId,
  referenceNumber,
  amount,
  returned,
}: {
  rentalId: string;
  referenceNumber: string;
  amount: number;
  returned: PaymongoReturn;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (returned !== "success") return;
    let polls = 0;
    const timer = window.setInterval(() => {
      polls += 1;
      router.refresh();
      if (polls >= POLL_LIMIT) window.clearInterval(timer);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [returned, router]);

  function startCheckout() {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("rentalId", rentalId);
      formData.set("referenceNumber", referenceNumber);
      const result = await startPaymongoCheckoutAction(formData);
      if (!result.success) {
        setError(result.message);
        return;
      }
      if (!result.data) {
        setError("We could not start online payment.");
        return;
      }
      window.location.assign(result.data.checkoutUrl);
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-5 text-left">
      <h2 className="text-base font-semibold text-brand-950">Pay online</h2>
      <p className="text-sm text-muted-foreground">
        GCash, Maya, card, or QR Ph through PayMongo. No screenshot needed.
      </p>
      {returned === "success" ? (
        <Alert>
          <Info />
          <AlertDescription>
            Thanks! We are confirming your payment with PayMongo. This page
            updates on its own.
          </AlertDescription>
        </Alert>
      ) : null}
      {returned === "cancelled" ? (
        <Alert>
          <Info />
          <AlertDescription>
            Payment was not completed. You can try again or upload a payment
            proof below.
          </AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <Info />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button
        className="w-full"
        disabled={pending || returned === "success"}
        onClick={startCheckout}
        size="lg"
        type="button"
      >
        {pending ? <Spinner /> : <CreditCard />}
        {pending ? "Opening PayMongo..." : `Pay ${formatPhp(amount)} online`}
      </Button>
    </div>
  );
}
