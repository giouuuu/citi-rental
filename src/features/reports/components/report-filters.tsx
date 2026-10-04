"use client";

import { useSearchParams } from "next/navigation";

import { DataTableLoadingBar } from "@/components/data-table/data-table-loading-bar";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import {
  DateRangePicker,
  useDebouncedNavigation,
  type DateRangePreset,
} from "@/features/shared/client";

const ALL_VEHICLES = "all";

export function ReportFilters({
  vehicles,
  presets,
  fromValue,
  toValue,
  vehicleId,
}: {
  vehicles: { id: string; label: string }[];
  presets: DateRangePreset[];
  fromValue: string;
  toValue: string;
  vehicleId: string | null;
}) {
  const searchParams = useSearchParams();
  const { isPending, navigateNow } = useDebouncedNavigation();

  function urlFor(changes: Record<string, string>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (!value || value === ALL_VEHICLES) next.delete(key);
      else next.set(key, value);
    }
    const search = next.toString();
    return search ? `/reports?${search}` : "/reports";
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="report-period">Period</Label>
          <DateRangePicker
            id="report-period"
            onSelect={({ from, to }) => navigateNow(urlFor({ from, to }))}
            presets={presets}
            value={{ from: fromValue, to: toValue }}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="report-vehicle">Vehicle</Label>
          <Combobox
            className="min-w-56"
            emptyMessage="No vehicle matches."
            id="report-vehicle"
            onValueChange={(value) => navigateNow(urlFor({ vehicle_id: value }))}
            options={[
              { value: ALL_VEHICLES, label: "All vehicles" },
              ...vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.label })),
            ]}
            placeholder="All vehicles"
            searchPlaceholder="Search vehicles…"
            searchable
            value={vehicleId ?? ALL_VEHICLES}
          />
        </div>
      </div>
      <DataTableLoadingBar pending={isPending} />
    </div>
  );
}
