"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { saveExpenseAction, saveFixedAssetAction } from "@/features/finance/actions/ledger-actions";
import { saveVehicleLoanAction } from "@/features/finance/actions/vehicle-loan-actions";
import { expenseDefinition } from "@/features/finance/schemas/expense-definition";
import { fixedAssetDefinition } from "@/features/finance/schemas/fixed-asset-definition";
import { vehicleLoanDefinition } from "@/features/finance/schemas/vehicle-loan-definition";
import { ResourceFormDialog } from "@/features/shared/components/resource-form-dialog";
import type { ResourceReferences, ResourceRow } from "@/features/shared/types/resource";
import {
  RecordLoanPaymentDialog,
  type LoanPaymentTarget,
} from "@/features/vehicles/components/record-loan-payment-dialog";

type Dialog = "expense" | "loan" | "asset" | null;

type VehicleActions = {
  vehicleId: string;
  /** Owner: may touch the books (expenses, loans, the asset register). */
  canManageBooks: boolean;
  /** May create rentals for this car. */
  canRent: boolean;
  recordExpense: () => void;
  /** Opens the loan form: blank for a new loan, filled to edit `row`. */
  editLoan: (row?: ResourceRow) => void;
  addPurchaseCost: () => void;
  recordLoanPayment: (target: LoanPaymentTarget) => void;
};

const VehicleActionsContext = createContext<VehicleActions | null>(null);

export function useVehicleActions() {
  const context = useContext(VehicleActionsContext);
  if (!context) throw new Error("useVehicleActions must be used inside VehicleActionsProvider.");
  return context;
}

const fieldsWithout = <T extends { name: string }>(fields: T[], names: string[]) =>
  fields.filter((field) => !names.includes(field.name));

/**
 * Every write the vehicle page offers, in one place, so the header, the
 * Overview and the Financing tab open the same dialogs. Each dialog is a
 * finance form with the vehicle already filled in.
 */
export function VehicleActionsProvider({
  vehicleId,
  vehicleLabel,
  today,
  canManageBooks,
  canRent,
  expenseReferences,
  children,
}: {
  vehicleId: string;
  /** Plate and name, e.g. "AAA 111 · Vios One". */
  vehicleLabel: string;
  today: string;
  canManageBooks: boolean;
  canRent: boolean;
  expenseReferences: ResourceReferences;
  children: ReactNode;
}) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [loanRow, setLoanRow] = useState<ResourceRow | null>(null);
  const [payment, setPayment] = useState<LoanPaymentTarget | null>(null);

  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };

  const recordExpense = useCallback(() => setDialog("expense"), []);
  const editLoan = useCallback((row?: ResourceRow) => {
    setLoanRow(row ?? null);
    setDialog("loan");
  }, []);
  const addPurchaseCost = useCallback(() => setDialog("asset"), []);
  const recordLoanPayment = useCallback((target: LoanPaymentTarget) => setPayment(target), []);

  const value = useMemo(
    () => ({ vehicleId, canManageBooks, canRent, recordExpense, editLoan, addPurchaseCost, recordLoanPayment }),
    [vehicleId, canManageBooks, canRent, recordExpense, editLoan, addPurchaseCost, recordLoanPayment],
  );

  const expenseInitial = useMemo(
    () => ({ vehicle_id: vehicleId, expense_date: today, document_type: "vat_invoice", status: "recorded" }),
    [vehicleId, today],
  );
  const loanInitial = useMemo(
    () => ({ vehicle_id: vehicleId, interest_method: "effective", status: "active", installments_paid_before: "0" }),
    [vehicleId],
  );
  const assetInitial = useMemo(
    () => ({
      vehicle_id: vehicleId,
      name: vehicleLabel,
      asset_class: "vehicle",
      salvage_value: "0",
      useful_life_months: "60",
      depreciation_method: "straight_line",
    }),
    [vehicleId, vehicleLabel],
  );

  return (
    <VehicleActionsContext.Provider value={value}>
      {children}
      {canManageBooks ? (
        <>
          <ResourceFormDialog
            action={saveExpenseAction}
            definition={{
              key: expenseDefinition.key,
              singular: expenseDefinition.singular,
              // Status is always "recorded" for a new expense.
              fields: fieldsWithout(expenseDefinition.fields, ["status"]),
            }}
            description={`Tagged to ${vehicleLabel}, so it counts against this car's profit.`}
            hiddenFields={["vehicle_id"]}
            initialValues={expenseInitial}
            onOpenChange={close}
            open={dialog === "expense"}
            references={expenseReferences}
            title="Record expense"
          />
          <ResourceFormDialog
            action={saveVehicleLoanAction}
            definition={{
              key: vehicleLoanDefinition.key,
              singular: vehicleLoanDefinition.singular,
              // A new loan is always active; status is only edited later.
              fields: loanRow ? vehicleLoanDefinition.fields : fieldsWithout(vehicleLoanDefinition.fields, ["status"]),
            }}
            description="Copy the figures from the bank's disclosure statement. The monthly schedule is built for you."
            hiddenFields={["vehicle_id"]}
            initialValues={loanInitial}
            onOpenChange={close}
            open={dialog === "loan"}
            row={loanRow}
            title={loanRow ? "Edit car loan" : "Set up car loan"}
          />
          <ResourceFormDialog
            action={saveFixedAssetAction}
            definition={{
              key: fixedAssetDefinition.key,
              singular: fixedAssetDefinition.singular,
              fields: fieldsWithout(fixedAssetDefinition.fields, ["disposed_on", "disposal_proceeds"]),
            }}
            description="What you paid for the car. Its yearly loss in value (depreciation) is worked out from this."
            hiddenFields={["vehicle_id", "asset_class"]}
            initialValues={assetInitial}
            onOpenChange={close}
            open={dialog === "asset"}
            title="Add purchase cost"
          />
          <RecordLoanPaymentDialog
            onOpenChange={(open) => {
              if (!open) setPayment(null);
            }}
            target={payment}
            today={today}
          />
        </>
      ) : null}
    </VehicleActionsContext.Provider>
  );
}
