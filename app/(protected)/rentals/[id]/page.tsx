import { saveRentalAction } from "@/features/rentals";
import { rentalDefinition } from "@/features/rentals";
import { ResourceDetailScreen } from "@/features/shared";
import { RentalWorkflowActions } from "@/features/rentals";
import {
  ConfirmDepositCard,
} from "@/features/rentals/components/confirm-deposit-card";
import { RentalDetailTabs } from "@/features/rentals/components/rental-detail-tabs";
import { RentalPaymentPanel } from "@/features/rentals/components/rental-payment-panel";
import type { RentalWorkflowStatus } from "@/features/rentals/lib/booking-gates";
import { isPublicCustomerBooking } from "@/features/rentals/lib/is-public-customer-booking";
import { needsDepositConfirmation } from "@/features/rentals/lib/needs-deposit-confirmation";
import { listRentalPayments } from "@/features/rentals/services/list-rental-payments";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);

  let status: RentalWorkflowStatus = "draft";
  let paymentStatus: string | null = null;
  let quotedTotal: number | null = null;
  let depositAmount: number | null = null;
  let balanceDue: number | null = null;
  let depositPercent: number | null = null;
  let paymentReference: string | null = null;
  let customerLabel: string | null = null;
  let payments: Awaited<ReturnType<typeof listRentalPayments>> = [];

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const [{ data }, paymentRows] = await Promise.all([
      supabase
        .from("rentals")
        .select(
          `
          status,
          payment_status,
          quoted_total,
          deposit_amount,
          balance_due,
          deposit_percent,
          payment_reference,
          customers ( full_name, phone_number )
        `,
        )
        .eq("id", id)
        .maybeSingle(),
      listRentalPayments(id),
    ]);
    payments = paymentRows;
    if (data?.status) status = data.status as RentalWorkflowStatus;
    paymentStatus = data?.payment_status ?? null;
    quotedTotal =
      data?.quoted_total != null ? Number(data.quoted_total) : null;
    depositAmount =
      data?.deposit_amount != null ? Number(data.deposit_amount) : null;
    balanceDue = data?.balance_due != null ? Number(data.balance_due) : null;
    depositPercent =
      data?.deposit_percent != null ? Number(data.deposit_percent) : null;
    paymentReference =
      typeof data?.payment_reference === "string"
        ? data.payment_reference
        : null;

    const customer = Array.isArray(data?.customers)
      ? data.customers[0]
      : data?.customers;
    if (customer && typeof customer === "object") {
      const name =
        "full_name" in customer && typeof customer.full_name === "string"
          ? customer.full_name
          : null;
      const phone =
        "phone_number" in customer && typeof customer.phone_number === "string"
          ? customer.phone_number
          : null;
      customerLabel = [name, phone].filter(Boolean).join(" · ") || null;
    }
  } else {
    const demo = rentalDefinition.demoRows?.find((row) => row.id === id);
    if (demo?.status) status = demo.status as RentalWorkflowStatus;
  }

  const pendingDeposit = payments.find(
    (payment) =>
      payment.paymentType === "deposit" && payment.status === "submitted",
  );
  const showConfirmCard = needsDepositConfirmation({
    status,
    paymentStatus,
    payments,
  });

  return (
    <ResourceDetailScreen
      action={saveRentalAction}
      actions={<RentalWorkflowActions id={id} status={status} />}
      definition={rentalDefinition}
      formReadOnly={(row) => isPublicCustomerBooking(row)}
      id={id}
      saved={query.saved === "1"}
    >
      {({ form, row }) => (
        <RentalDetailTabs
          alert={
            showConfirmCard ? (
              <ConfirmDepositCard
                customerLabel={customerLabel}
                depositAmount={depositAmount}
                paymentReference={
                  pendingDeposit?.externalReference ?? paymentReference
                }
                proofUrl={pendingDeposit?.proofUrl ?? null}
                rentalId={id}
              />
            ) : null
          }
          customerBookingLocked={isPublicCustomerBooking(row)}
          info={form}
          payments={
            <RentalPaymentPanel
              balanceDue={balanceDue}
              depositAmount={depositAmount}
              depositPercent={depositPercent}
              paymentStatus={paymentStatus}
              payments={payments}
              quotedTotal={quotedTotal}
              rentalId={id}
            />
          }
        />
      )}
    </ResourceDetailScreen>
  );
}
