import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { saveRentalAction } from "@/features/rentals";
import { rentalDefinition } from "@/features/rentals";
import { RENTAL_BOOKING_PAYMENT_FIELDS } from "@/features/rentals/schemas/rental-definition";
import { ResourceDetailScreen } from "@/features/shared";
import { RentalWorkflowActions } from "@/features/rentals";
import type { RentalCancellationContext } from "@/features/rentals/components/rental-workflow-actions";
import { DEFAULT_FREE_CANCELLATION_HOURS } from "@/features/rentals/lib/cancellation-policy";
import { ConfirmDepositCard } from "@/features/rentals/components/confirm-deposit-card";
import { RentalDetailTabs } from "@/features/rentals/components/rental-detail-tabs";
import { RentalPaymentPanel } from "@/features/rentals/components/rental-payment-panel";
import { RentalTimeline } from "@/features/rentals/components/rental-timeline";
import {
  RentalRenterIds,
  type RentalRenterIdPhoto,
} from "@/features/rentals/components/rental-renter-ids";
import { idPhotoCopy } from "@/features/booking/schemas/public-booking-schema";
import { BOOKING_IDS_BUCKET } from "@/features/booking/lib/upload-booking-id-photos";
import type { RentalWorkflowStatus } from "@/features/rentals/lib/booking-gates";
import { isPublicCustomerBooking } from "@/features/rentals/lib/is-public-customer-booking";
import { needsDepositConfirmation } from "@/features/rentals/lib/needs-deposit-confirmation";
import type { RentRates } from "@/features/rentals/lib/rent-pricing";
import { listRentalPayments } from "@/features/rentals/services/list-rental-payments";
import { listRentalChargeTypes } from "@/features/rentals/services/list-rental-charge-types";
import { listRentalChargeCosts } from "@/features/rentals/services/list-rental-charge-costs";
import { RENTAL_QUICK_CREATE } from "@/features/rentals/lib/rental-quick-create";
import {
  getInspectionChecklistForRental,
  listRentalInspections,
  listVehicleKnownDamages,
  RentalInspectionsTab,
} from "@/features/inspections";
import { getAgreementDraft } from "@/features/agreements/services/get-agreement-draft";
import { getRentalAgreement } from "@/features/agreements/services/get-rental-agreement";
import type { AgreementDraft } from "@/features/agreements/types";
import type { RentalBillDriver } from "@/features/rentals/lib/rental-bill";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; payment?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);

  let status: RentalWorkflowStatus = "draft";
  let paymentStatus: string | null = null;
  let quotedTotal: number | null = null;
  let driver: RentalBillDriver | null = null;
  let quotedRates: RentRates | null = null;
  let quotedDays: number | null = null;
  let quotedHours: number | null = null;
  let schedule: {
    startAt: string;
    expectedReturnAt: string;
    rates: RentRates | null;
  } | null = null;
  let chargeTypes: Awaited<ReturnType<typeof listRentalChargeTypes>> = [];
  let chargeCosts: Record<string, number> = {};
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
  let cancellation: RentalCancellationContext | null = null;
  let agreementDraft: AgreementDraft | null = null;
  let hasAgreement = false;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const [
      { data },
      paymentRows,
      inspectionRows,
      checklistData,
      chargeTypeRows,
      chargeCostRows,
      { data: company },
    ] = await Promise.all([
      supabase
        .from("rentals")
        .select(
          `
          status,
          payment_status,
          quoted_total,
          quoted_daily_rate,
          quoted_half_day_rate,
          quoted_hourly_rate,
          quoted_days,
          quoted_hours,
          with_driver,
          driver_daily_rate,
          driver_days,
          driver_fee,
          start_at,
          expected_return_at,
          deposit_amount,
          deposit_percent,
          payment_reference,
          vehicle_id,
          starting_odometer,
          renter_license_selfie_path,
          renter_government_id_path,
          cancellation_reason,
          cancellation_note,
          reservation_fee_forfeited,
          customers ( full_name, phone_number ),
          vehicles ( daily_rate, half_day_rate, hourly_rate )
        `,
        )
        .eq("id", id)
        .maybeSingle(),
      listRentalPayments(id),
      listRentalInspections(id),
      getInspectionChecklistForRental(id),
      listRentalChargeTypes(),
      listRentalChargeCosts(id),
      supabase
        .from("company_profile")
        .select("free_cancellation_hours")
        .maybeSingle(),
    ]);
    payments = paymentRows;
    chargeTypes = chargeTypeRows;
    chargeCosts = chargeCostRows;
    inspections = inspectionRows;
    checklist = checklistData;
    if (data?.status) status = data.status as RentalWorkflowStatus;
    paymentStatus = data?.payment_status ?? null;
    quotedTotal = data?.quoted_total != null ? Number(data.quoted_total) : null;
    driver = data?.with_driver
      ? {
          fee: Number(data.driver_fee ?? 0),
          rate:
            data.driver_daily_rate != null
              ? Number(data.driver_daily_rate)
              : null,
          days: data.driver_days != null ? Number(data.driver_days) : null,
        }
      : null;
    const rate = (value: unknown) => (value != null ? Number(value) : null);
    quotedDays = rate(data?.quoted_days);
    quotedHours = rate(data?.quoted_hours);
    const quotedDailyRate = rate(data?.quoted_daily_rate);
    if (quotedDailyRate != null) {
      quotedRates = {
        daily: quotedDailyRate,
        halfDay: rate(data?.quoted_half_day_rate),
        hourly: rate(data?.quoted_hourly_rate),
      };
    }
    const vehicle = Array.isArray(data?.vehicles)
      ? data.vehicles[0]
      : data?.vehicles;
    // Extensions price at the rates this rental was booked at; rentals quoted
    // by calendar days had no 12-hour or hourly rate, so use the car's.
    const vehicleDaily = rate(vehicle?.daily_rate);
    const extendRates: RentRates | null =
      quotedRates && quotedHours != null
        ? quotedRates
        : (quotedDailyRate ?? vehicleDaily) != null
          ? {
              daily: (quotedDailyRate ?? vehicleDaily)!,
              halfDay: rate(vehicle?.half_day_rate),
              hourly: rate(vehicle?.hourly_rate),
            }
          : null;
    if (data?.start_at && data.expected_return_at) {
      schedule = {
        startAt: String(data.start_at),
        expectedReturnAt: String(data.expected_return_at),
        rates: extendRates,
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
    vehicleId = typeof data?.vehicle_id === "string" ? data.vehicle_id : null;
    startingOdometer =
      data?.starting_odometer != null ? Number(data.starting_odometer) : null;

    cancellation = {
      startAt: data?.start_at ? String(data.start_at) : null,
      depositPaid: paymentRows
        .filter(
          (payment) =>
            payment.paymentType === "deposit" && payment.status === "confirmed",
        )
        .reduce((sum, payment) => sum + payment.amount, 0),
      freeHours:
        company?.free_cancellation_hours != null
          ? Number(company.free_cancellation_hours)
          : DEFAULT_FREE_CANCELLATION_HOURS,
      reason: data?.cancellation_reason ?? null,
      note: data?.cancellation_note ?? null,
      feeForfeited: data?.reservation_fee_forfeited ?? null,
    };

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

    const awaitingRelease =
      (status === "draft" || status === "reserved") &&
      !inspectionRows.some((row) => row.inspectionType === "pickup");
    const [damages, draft, signed] = await Promise.all([
      vehicleId ? listVehicleKnownDamages(vehicleId) : Promise.resolve([]),
      awaitingRelease ? getAgreementDraft(id) : Promise.resolve(null),
      awaitingRelease ? Promise.resolve(null) : getRentalAgreement(id),
    ]);
    knownDamages = damages;
    agreementDraft = draft;
    hasAgreement = signed != null;

    // With a driver the renter sent a government ID and a selfie holding it.
    const idCopy = idPhotoCopy[data?.with_driver ? "with-driver" : "self-drive"];
    const idPaths = [
      [idCopy.selfieLabel, data?.renter_license_selfie_path],
      [idCopy.idLabel, data?.renter_government_id_path],
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
          agreementDraft={agreementDraft}
          cancellation={cancellation}
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
      // Payments after booking go on the Bill & payments tab.
      hiddenFields={[...RENTAL_BOOKING_PAYMENT_FIELDS]}
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
            <RentalInspectionsTab
              hasAgreement={hasAgreement}
              inspections={inspections}
              rentalId={id}
              rentalStatus={status}
            />
          }
          payments={
            <RentalPaymentPanel
              chargeCosts={chargeCosts}
              chargeTypes={chargeTypes}
              depositAmount={depositAmount}
              depositPercent={depositPercent}
              paymentStatus={paymentStatus}
              payments={payments}
              quotedDays={quotedDays}
              quotedHours={quotedHours}
              quotedRates={quotedRates}
              bookingPaymentFailed={query.payment === "failed"}
              quotedTotal={quotedTotal}
              driver={driver}
              rentalId={id}
              rentalStatus={status}
            />
          }
          renterIds={
            renterIdPhotos ? <RentalRenterIds photos={renterIdPhotos} /> : null
          }
          timeline={
            <Suspense fallback={<Skeleton className="h-64 rounded-lg" />}>
              <RentalTimeline rentalId={id} />
            </Suspense>
          }
        />
      )}
    </ResourceDetailScreen>
  );
}
