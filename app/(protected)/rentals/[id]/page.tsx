import { saveRentalAction } from "@/features/rentals";
import { rentalDefinition } from "@/features/rentals";
import { ResourceDetailScreen } from "@/features/shared";
import { RentalWorkflowActions } from "@/features/rentals";
import {
  ConfirmDepositCard,
} from "@/features/rentals/components/confirm-deposit-card";
import { RentalDetailTabs } from "@/features/rentals/components/rental-detail-tabs";
import { RentalPaymentPanel } from "@/features/rentals/components/rental-payment-panel";
import {
  RentalRenterIds,
  type RentalRenterIdPhoto,
} from "@/features/rentals/components/rental-renter-ids";
import { BOOKING_IDS_BUCKET } from "@/features/booking/lib/upload-booking-id-photos";
import type { RentalWorkflowStatus } from "@/features/rentals/lib/booking-gates";
import { isPublicCustomerBooking } from "@/features/rentals/lib/is-public-customer-booking";
import { needsDepositConfirmation } from "@/features/rentals/lib/needs-deposit-confirmation";
import { listRentalPayments } from "@/features/rentals/services/list-rental-payments";
import { listRentalChargeTypes } from "@/features/rentals/services/list-rental-charge-types";
import { RENTAL_QUICK_CREATE } from "@/features/rentals/lib/rental-quick-create";
import {
  getInspectionChecklistForRental,
  listRentalInspections,
  listVehicleKnownDamages,
  RentalInspectionsTab,
} from "@/features/inspections";
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
  let quotedDailyRate: number | null = null;
  let quotedDays: number | null = null;
  let schedule: {
    startAt: string;
    expectedReturnAt: string;
    dailyRate: number | null;
  } | null = null;
  let chargeTypes: Awaited<ReturnType<typeof listRentalChargeTypes>> = [];
  let depositAmount: number | null = null;
  let depositPercent: number | null = null;
  let paymentReference: string | null = null;
  let customerLabel: string | null = null;
  let vehicleId: string | null = null;
  let startingOdometer: number | null = null;
  let payments: Awaited<ReturnType<typeof listRentalPayments>> = [];
  let inspections: Awaited<ReturnType<typeof listRentalInspections>> = [];
  let checklist: Awaited<ReturnType<typeof getInspectionChecklistForRental>> =
    null;
  let knownDamages: Awaited<ReturnType<typeof listVehicleKnownDamages>> = [];
  let renterIdPhotos: RentalRenterIdPhoto[] | null = null;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const [{ data }, paymentRows, inspectionRows, checklistData, chargeTypeRows] =
      await Promise.all([
        supabase
          .from("rentals")
          .select(
            `
          status,
          payment_status,
          quoted_total,
          quoted_daily_rate,
          quoted_days,
          start_at,
          expected_return_at,
          deposit_amount,
          deposit_percent,
          payment_reference,
          vehicle_id,
          starting_odometer,
          renter_license_selfie_path,
          renter_government_id_path,
          customers ( full_name, phone_number ),
          vehicles ( daily_rate )
        `,
          )
          .eq("id", id)
          .maybeSingle(),
        listRentalPayments(id),
        listRentalInspections(id),
        getInspectionChecklistForRental(id),
        listRentalChargeTypes(),
      ]);
    payments = paymentRows;
    chargeTypes = chargeTypeRows;
    inspections = inspectionRows;
    checklist = checklistData;
    if (data?.status) status = data.status as RentalWorkflowStatus;
    paymentStatus = data?.payment_status ?? null;
    quotedTotal =
      data?.quoted_total != null ? Number(data.quoted_total) : null;
    quotedDailyRate =
      data?.quoted_daily_rate != null ? Number(data.quoted_daily_rate) : null;
    quotedDays = data?.quoted_days != null ? Number(data.quoted_days) : null;
    const vehicle = Array.isArray(data?.vehicles) ? data.vehicles[0] : data?.vehicles;
    if (data?.start_at && data.expected_return_at) {
      schedule = {
        startAt: String(data.start_at),
        expectedReturnAt: String(data.expected_return_at),
        dailyRate:
          quotedDailyRate ??
          (vehicle?.daily_rate != null ? Number(vehicle.daily_rate) : null),
      };
    }
    depositAmount =
      data?.deposit_amount != null ? Number(data.deposit_amount) : null;
    depositPercent =
      data?.deposit_percent != null ? Number(data.deposit_percent) : null;
    paymentReference =
      typeof data?.payment_reference === "string"
        ? data.payment_reference
        : null;
    vehicleId =
      typeof data?.vehicle_id === "string" ? data.vehicle_id : null;
    startingOdometer =
      data?.starting_odometer != null ? Number(data.starting_odometer) : null;

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

    if (vehicleId) {
      knownDamages = await listVehicleKnownDamages(vehicleId);
    }

    const idPaths = [
      ["Selfie with driver's license", data?.renter_license_selfie_path],
      ["Another government ID", data?.renter_government_id_path],
    ] as const;
    if (idPaths.some(([, path]) => path)) {
      renterIdPhotos = await Promise.all(
        idPaths.map(async ([label, path]) => {
          if (!path) return { label, url: null };
          const { data: signed } = await supabase.storage
            .from(BOOKING_IDS_BUCKET)
            .createSignedUrl(path, 60 * 30);
          return { label, url: signed?.signedUrl ?? null };
        }),
      );
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
      actions={
        <RentalWorkflowActions
          checklist={checklist}
          id={id}
          inspections={inspections}
          knownDamages={knownDamages}
          schedule={schedule}
          startingOdometer={startingOdometer}
          status={status}
        />
      }
      definition={rentalDefinition}
      formReadOnly={(row) => isPublicCustomerBooking(row)}
      quickCreate={status === "draft" ? RENTAL_QUICK_CREATE : undefined}
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
                paidOnline={pendingDeposit?.method === "paymongo"}
                proofUrl={pendingDeposit?.proofUrl ?? null}
                rentalId={id}
              />
            ) : null
          }
          customerBookingLocked={isPublicCustomerBooking(row)}
          info={form}
          inspections={
            <RentalInspectionsTab inspections={inspections} rentalId={id} />
          }
          payments={
            <RentalPaymentPanel
              chargeTypes={chargeTypes}
              depositAmount={depositAmount}
              depositPercent={depositPercent}
              paymentStatus={paymentStatus}
              payments={payments}
              quotedDailyRate={quotedDailyRate}
              quotedDays={quotedDays}
              quotedTotal={quotedTotal}
              rentalId={id}
              rentalStatus={status}
            />
          }
          renterIds={
            renterIdPhotos ? <RentalRenterIds photos={renterIdPhotos} /> : null
          }
        />
      )}
    </ResourceDetailScreen>
  );
}
