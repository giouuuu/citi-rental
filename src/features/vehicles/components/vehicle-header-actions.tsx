"use client";

import Link from "next/link";
import {
  CalendarPlus,
  Camera,
  ChevronDown,
  HandCoins,
  Landmark,
  Pencil,
  Receipt,
  Route,
  Tag,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { LoanPaymentTarget } from "@/features/vehicles/components/record-loan-payment-dialog";
import { useVehicleActions } from "@/features/vehicles/components/vehicle-actions-provider";

/**
 * The car's actions, reachable from every tab: rent it, record what it cost,
 * pay its loan, and jump to its details, maintenance, photos and tracking.
 */
export function VehicleHeaderActions({
  nextLoanPayment,
  hasActiveLoan,
  assetId,
}: {
  /** The installment to pay now on the active loan, if any. */
  nextLoanPayment: LoanPaymentTarget | null;
  hasActiveLoan: boolean;
  /** The car's fixed-asset register row, once its purchase cost is recorded. */
  assetId: string | null;
}) {
  const { vehicleId, canManageBooks, canRent, recordExpense, editLoan, addPurchaseCost, recordLoanPayment } =
    useVehicleActions();

  return (
    <>
      {canRent ? (
        <Button asChild>
          <Link href={`/rentals/new?vehicle_id=${vehicleId}`}>
            <CalendarPlus /> New rental
          </Link>
        </Button>
      ) : null}
      {canManageBooks ? (
        <Button onClick={recordExpense} variant="outline">
          <Receipt /> Record expense
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            More <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {canManageBooks ? (
            <>
              <DropdownMenuLabel>Money</DropdownMenuLabel>
              <DropdownMenuGroup>
                {nextLoanPayment ? (
                  <DropdownMenuItem onSelect={() => recordLoanPayment(nextLoanPayment)}>
                    <HandCoins /> Record loan payment
                  </DropdownMenuItem>
                ) : null}
                {!hasActiveLoan ? (
                  <DropdownMenuItem onSelect={() => editLoan()}>
                    <Landmark /> Set up car loan
                  </DropdownMenuItem>
                ) : null}
                {assetId ? (
                  <DropdownMenuItem asChild>
                    <Link href={`/finance/assets/${assetId}`}>
                      <Tag /> Purchase cost and depreciation
                    </Link>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={addPurchaseCost}>
                    <Tag /> Add purchase cost
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link href={`/finance/expenses?vehicle=${vehicleId}`}>
                    <Receipt /> All expenses for this car
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuLabel>Car</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link href={`/vehicles/${vehicleId}?tab=info`} scroll={false}>
                <Pencil /> Edit details and status
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/vehicles/${vehicleId}?tab=maintenance`} scroll={false}>
                <Wrench /> Maintenance and service history
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/vehicles/${vehicleId}?tab=photos`} scroll={false}>
                <Camera /> Photos
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/vehicles/${vehicleId}/tracking`}>
                <Route /> Tracking
              </Link>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
