"use client";

import { HandCoins, Landmark, Receipt, Tag } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { LoanPaymentTarget } from "@/features/vehicles/components/record-loan-payment-dialog";
import { useVehicleActions } from "@/features/vehicles/components/vehicle-actions-provider";

/** A vehicle action placed inside server-rendered content (the Overview). */
export function VehicleActionButton(
  props: (
    | { action: "expense" | "loan" | "asset" }
    | { action: "payment"; target: LoanPaymentTarget }
  ) & { variant?: "default" | "outline" | "ghost"; size?: "default" | "sm" },
) {
  const actions = useVehicleActions();
  if (!actions.canManageBooks) return null;

  const { variant = "outline", size = "sm" } = props;
  let Icon = Receipt;
  let label = "Record expense";
  let run: () => void = actions.recordExpense;
  if (props.action === "loan") {
    [Icon, label, run] = [Landmark, "Set up car loan", () => actions.editLoan()];
  } else if (props.action === "asset") {
    [Icon, label, run] = [Tag, "Add purchase cost", actions.addPurchaseCost];
  } else if (props.action === "payment") {
    const { target } = props;
    [Icon, label, run] = [HandCoins, "Record payment", () => actions.recordLoanPayment(target)];
  }

  return (
    <Button onClick={run} size={size} variant={variant}>
      <Icon /> {label}
    </Button>
  );
}
