import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SiteHeader } from "@/components/landing/site-header";
import { Button } from "@/components/ui/button";

type ConfirmationPageProps = {
  searchParams: Promise<{
    ref?: string;
    rentalId?: string;
    vehicle?: string;
    start?: string;
    end?: string;
  }>;
};

export const metadata: Metadata = {
  title: "Continue to payment",
  description: "Pay your booking deposit to confirm the reservation.",
};

export default async function BookingConfirmationPage({
  searchParams,
}: ConfirmationPageProps) {
  const query = await searchParams;
  if (query.rentalId && query.ref) {
    redirect(
      `/book/pay/${query.rentalId}?ref=${encodeURIComponent(query.ref)}`,
    );
  }

  return (
    <main className="min-h-screen bg-background" id="main-content">
      <div className="bg-brand-950 text-white">
        <SiteHeader />
      </div>

      <div className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-brand-950">
          Continue to payment
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Open the payment link from your booking confirmation, or contact us
          with your reference number
          {query.ref ? (
            <>
              {" "}
              (<span className="font-semibold text-brand-950">{query.ref}</span>
            </>
          ) : null}
          .
        </p>
        <div className="mt-8">
          <Button asChild size="lg">
            <Link href="/#fleet">Back to fleet</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
