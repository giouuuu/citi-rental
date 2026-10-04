import {
  archiveVehicleAction,
  listVehiclePhotos,
  saveVehicleAction,
  VehicleGalleryPanel,
  vehicleDefinition,
} from "@/features/vehicles";
import { ResourceDetailScreen } from "@/features/shared";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { listVehicleRentals } from "@/features/vehicles/services/list-vehicle-rentals";
import { VehicleDetailTabs } from "@/features/vehicles/components/vehicle-detail-tabs";
import {
  CloneCategoryTemplateCard,
  listVehicleKnownDamages,
  VehicleKnownDamagesPanel,
} from "@/features/inspections";
import {
  listVehicleExpenses,
  VehicleCostsPanel,
} from "@/features/vehicle-costs";
import { PanelError } from "@/features/analytics/components/panel-error";
import { getVehicleMaintenance, MaintenanceDueAlert, VehicleMaintenancePanel } from "@/features/maintenance";
import { expenseDefinition } from "@/features/finance";
import { bookValueAt, depreciationSchedule } from "@/features/finance/lib/depreciation";
import { financePeriodOptions, resolveFinanceWindow } from "@/features/finance/lib/finance-period";
import { loanProgress } from "@/features/finance/lib/loan-schedule";
import { DEPRECIATION_METHOD_LABELS } from "@/features/finance/schemas/fixed-asset-definition";
import { getTaxSettings } from "@/features/finance/services/finance-service";
import { getVehicleBooks } from "@/features/finance/services/vehicle-loan-service";
import { rentalDefinition } from "@/features/rentals";
import { manilaDateKey } from "@/features/shared/lib/manila-time";
import { getViewerRole } from "@/features/shared/services/get-viewer-role";
import { loadResourceReferences } from "@/features/shared/services/load-resource-references";
import type { ResourceReferences } from "@/features/shared/types/resource";
import { VehicleActionsProvider } from "@/features/vehicles/components/vehicle-actions-provider";
import {
  VehicleFinancingPanel,
  type VehicleAssetView,
  type VehicleLoanView,
} from "@/features/vehicles/components/vehicle-financing-panel";
import { VehicleHeaderActions } from "@/features/vehicles/components/vehicle-header-actions";
import {
  VEHICLE_OVERVIEW_DEFAULT_PERIOD,
  VehicleOverviewPanel,
} from "@/features/vehicles/components/vehicle-overview-panel";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, query, settings] = await Promise.all([params, searchParams, getTaxSettings()]);
  const read = (key: string) => {
    const value = query[key];
    return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
  };

  const configured = isSupabaseConfigured();
  const now = new Date();
  const today = manilaDateKey(now);
  const window = resolveFinanceWindow(
    { period: read("period"), from: read("from"), to: read("to") },
    settings.fiscalYearStartMonth,
    now,
    VEHICLE_OVERVIEW_DEFAULT_PERIOD,
  );

  const role = configured ? await getViewerRole() : null;
  const isOwner = role === "owner";

  const [rentals, damages, photos, vehicle, booksResult, expenseReferences, maintenance, expenses] = await Promise.all([
    configured ? listVehicleRentals(id) : [],
    configured ? listVehicleKnownDamages(id, { includeResolved: true }) : [],
    configured ? listVehiclePhotos(id) : [],
    configured
      ? createClient().then(async (supabase) => {
          const { data } = await supabase
            .from("vehicles")
            .select("plate_number, name, current_odometer")
            .eq("id", id)
            .maybeSingle();
          return data;
        })
      : null,
    isOwner ? getVehicleBooks(id) : null,
    isOwner
      ? createClient().then((supabase) =>
          loadResourceReferences(
            supabase,
            expenseDefinition.fields.filter((field) => field.name !== "vehicle_id"),
          ),
        )
      : ({} as ResourceReferences),
    configured ? getVehicleMaintenance(id) : null,
    configured ? listVehicleExpenses(id) : [],
  ]);

  const books = booksResult?.ok ? booksResult.data : null;
  const loanViews: VehicleLoanView[] = (books?.loans ?? []).map((loan) => ({
    loan,
    progress: loanProgress(loan, books?.payments ?? [], today),
  }));
  const activeLoan = loanViews.find((entry) => entry.loan.status === "active") ?? null;
  const nextLoanPayment =
    activeLoan?.progress.nextDue
      ? {
          loanId: activeLoan.loan.id,
          lenderName: activeLoan.loan.lenderName,
          termMonths: activeLoan.loan.termMonths,
          installment: activeLoan.progress.nextDue,
        }
      : null;

  let assetView: VehicleAssetView | null = null;
  if (books?.asset) {
    const asset = books.asset;
    const { accumulated, bookValue } = bookValueAt(asset, depreciationSchedule(asset), today);
    assetView = {
      id: asset.id,
      acquisitionDate: asset.acquisitionDate,
      acquisitionCost: asset.acquisitionCost,
      usefulLifeMonths: asset.usefulLifeMonths,
      methodLabel: DEPRECIATION_METHOD_LABELS[asset.method],
      accumulated,
      bookValue,
    };
  }

  const vehicleLabel = [vehicle?.plate_number, vehicle?.name].filter(Boolean).join(" · ");

  const currentOdometer =
    vehicle?.current_odometer === null || vehicle?.current_odometer === undefined
      ? null
      : Number(vehicle.current_odometer);
  const servicesDue = maintenance?.ok
    ? maintenance.data.schedule.filter((plan) => plan.status !== "on_schedule")
    : [];

  return (
    <VehicleActionsProvider
      canManageBooks={isOwner && books !== null}
      canRent={role !== null && rentalDefinition.writeRoles.includes(role)}
      expenseReferences={expenseReferences}
      today={today}
      vehicleId={id}
      vehicleLabel={vehicleLabel}
    >
      <ResourceDetailScreen
        action={saveVehicleAction}
        actions={
          <VehicleHeaderActions
            assetId={assetView?.id ?? null}
            hasActiveLoan={activeLoan !== null}
            nextLoanPayment={nextLoanPayment}
          />
        }
        archiveAction={archiveVehicleAction}
        definition={vehicleDefinition}
        id={id}
        saved={query.saved === "1"}
      >
        {({ form, row }) => (
          <VehicleDetailTabs
            damages={
              <div className="space-y-6">
                <VehicleKnownDamagesPanel
                  damages={damages.filter((damage) => !damage.isResolved)}
                />
                <CloneCategoryTemplateCard
                  category={
                    typeof row.category === "string" ? row.category : null
                  }
                />
              </div>
            }
            financing={
              isOwner ? (
                booksResult && !booksResult.ok ? (
                  <PanelError message={booksResult.message} title="Loan and cost" />
                ) : (
                  <VehicleFinancingPanel asset={assetView} loans={loanViews} />
                )
              ) : undefined
            }
            gallery={
              <VehicleGalleryPanel
                photos={photos}
                status={typeof row.status === "string" ? row.status : null}
                vehicleId={id}
              />
            }
            costs={<VehicleCostsPanel expenses={expenses} />}
            info={form}
            maintenance={
              maintenance === null ? undefined : maintenance.ok ? (
                <VehicleMaintenancePanel
                  canSeeExpenses={isOwner}
                  currentOdometer={currentOdometer}
                  schedule={maintenance.data.schedule}
                  records={maintenance.data.records}
                  today={today}
                  vehicleId={id}
                  vehicleLabel={vehicleLabel}
                />
              ) : (
                <PanelError message={maintenance.message} title="Maintenance" />
              )
            }
            maintenanceDue={servicesDue.length}
            notice={
              <MaintenanceDueAlert
                action={{ label: "Open maintenance", href: `/vehicles/${id}?tab=maintenance` }}
                items={servicesDue}
              >
                <p className="mt-1">
                  The car can still be booked. Record the service once it&apos;s done to reset the clock.
                </p>
              </MaintenanceDueAlert>
            }
            overview={
              configured ? (
                <VehicleOverviewPanel
                  books={isOwner && books ? { loan: activeLoan, asset: books.asset } : null}
                  periodOptions={financePeriodOptions(settings.fiscalYearStartMonth, now)}
                  vehicleId={id}
                  window={window}
                />
              ) : (
                <PanelError message="Connect Supabase to see how this car is performing." title="Vehicle overview" />
              )
            }
            rentals={rentals}
          />
        )}
      </ResourceDetailScreen>
    </VehicleActionsProvider>
  );
}
