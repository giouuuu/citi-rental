"use client";

import type { ReactNode } from "react";

import { SearchParamTabs } from "@/features/shared/components/search-param-tabs";
import type { VehicleRental } from "@/features/vehicles/services/list-vehicle-rentals";
import { VehicleBookingsTab } from "@/features/vehicles/components/vehicle-bookings-tab";

export function VehicleDetailTabs({
  info,
  rentals,
  gallery,
  damages,
}: {
  info: ReactNode;
  rentals: VehicleRental[];
  gallery?: ReactNode;
  damages?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <SearchParamTabs
        tabs={[
          { value: "info", label: "Info", content: info },
          ...(gallery
            ? [{ value: "photos", label: "Photo gallery", content: gallery }]
            : []),
          {
            value: "bookings",
            label: "Bookings",
            content: <VehicleBookingsTab rentals={rentals} />,
          },
          ...(damages
            ? [{ value: "damages", label: "Prior damage", content: damages }]
            : []),
        ]}
      />
    </div>
  );
}
