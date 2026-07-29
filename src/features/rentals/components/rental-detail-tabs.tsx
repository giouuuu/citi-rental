"use client";

import type { ReactNode } from "react";
import { Info } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SearchParamTabs } from "@/features/shared/components/search-param-tabs";

export function RentalDetailTabs({
  alert,
  info,
  payments,
  customerBookingLocked = false,
}: {
  alert?: ReactNode;
  info: ReactNode;
  payments: ReactNode;
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
            a customer. Use workflow actions for status changes and the Payments
            tab for deposit and balance updates.
          </AlertDescription>
        </Alert>
      ) : null}
      {alert ? <div>{alert}</div> : null}
      <SearchParamTabs
        tabs={[
          { value: "info", label: "Info", content: info },
          { value: "payments", label: "Payment history", content: payments },
        ]}
      />
    </div>
  );
}
