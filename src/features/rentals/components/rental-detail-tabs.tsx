"use client";

import type { ReactNode } from "react";
import { Info } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SearchParamTabs } from "@/features/shared/components/search-param-tabs";

export function RentalDetailTabs({
  alert,
  info,
  payments,
  inspections,
  renterIds,
  timeline,
  customerBookingLocked = false,
}: {
  alert?: ReactNode;
  info: ReactNode;
  payments: ReactNode;
  inspections?: ReactNode;
  renterIds?: ReactNode;
  /** The rental's latest steps, above the tabs on every tab. */
  timeline?: ReactNode;
  customerBookingLocked?: boolean;
}) {
  return (
    <div className="space-y-4">
      {customerBookingLocked ? (
        <Alert>
          <Info />
          <AlertTitle>Customer online booking</AlertTitle>
          <AlertDescription>
            Booking details are locked because this rental was placed online by
            a customer. Use workflow actions for status changes and the Bill
            &amp; payments tab for charges, deposits, and balance updates.
          </AlertDescription>
        </Alert>
      ) : null}
      {alert ? <div>{alert}</div> : null}
      {timeline}
      <SearchParamTabs
        tabs={[
          { value: "info", label: "Info", content: info },
          {
            value: "payments",
            label: "Bill & payments",
            content: payments,
          },
          ...(renterIds
            ? [{ value: "ids", label: "Renter IDs", content: renterIds }]
            : []),
          ...(inspections
            ? [
                {
                  value: "inspections",
                  label: "Condition",
                  content: inspections,
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}
