"use client";

import type { ReactNode } from "react";

import { SearchParamTabs } from "@/features/shared/components/search-param-tabs";
import type { VehicleRental } from "@/features/vehicles/services/list-vehicle-rentals";
import { VehicleBookingsTab } from "@/features/vehicles/components/vehicle-bookings-tab";

export function VehicleDetailTabs({
  info,
  rentals,
}: {
  info: ReactNode;
  rentals: VehicleRental[];
}) {
  return (
    <div className="space-y-4">
      <SearchParamTabs
        tabs={[
          { value: "info", label: "Info", content: info },
          {
            value: "bookings",
            label: "Bookings",
            content: <VehicleBookingsTab rentals={rentals} />,
          },
        ]}
      />
    </div>
  );
}
