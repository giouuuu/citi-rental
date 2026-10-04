"use client";

import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { SearchParamTabs } from "@/features/shared/components/search-param-tabs";
import type { VehicleRental } from "@/features/vehicles/services/list-vehicle-rentals";
import { VehicleBookingsTab } from "@/features/vehicles/components/vehicle-bookings-tab";

export function VehicleDetailTabs({
  overview,
  financing,
  info,
  rentals,
  gallery,
  damages,
  maintenance,
  maintenanceDue = 0,
  notice,
  costs,
}: {
  overview: ReactNode;
  /** Owner only: the car loan and purchase cost. */
  financing?: ReactNode;
  info: ReactNode;
  rentals: VehicleRental[];
  gallery?: ReactNode;
  damages?: ReactNode;
  maintenance?: ReactNode;
  /** Services due soon or overdue, counted on the tab. */
  maintenanceDue?: number;
  /** Shown above the tabs, whichever one is open. */
  notice?: ReactNode;
  /** Running costs logged against this car (fuel, repairs, fees). */
  costs?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      {notice}
      <SearchParamTabs
        defaultValue="overview"
        tabs={[
          { value: "overview", label: "Overview", content: overview },
          ...(financing
            ? [{ value: "financing", label: "Loan and cost", content: financing }]
            : []),
          {
            value: "bookings",
            label: "Bookings",
            content: <VehicleBookingsTab rentals={rentals} />,
          },
          ...(maintenance
            ? [
                {
                  value: "maintenance",
                  label: (
                    <>
                      Maintenance
                      {maintenanceDue > 0 ? (
                        <Badge className="ml-1.5 h-5 min-w-5 px-1.5" variant="destructive">
                          {maintenanceDue}
                          <span className="sr-only"> due</span>
                        </Badge>
                      ) : null}
                    </>
                  ),
                  content: maintenance,
                },
              ]
            : []),
          { value: "info", label: "Details", content: info },
          ...(gallery
            ? [{ value: "photos", label: "Photo gallery", content: gallery }]
            : []),
          ...(damages
            ? [{ value: "damages", label: "Prior damage", content: damages }]
            : []),
          ...(costs
            ? [{ value: "costs", label: "Costs", content: costs }]
            : []),
        ]}
      />
    </div>
  );
}
