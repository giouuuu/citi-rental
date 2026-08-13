"use client";

import { useSearchParams } from "next/navigation";

import { DataTableLoadingBar } from "@/components/data-table/data-table-loading-bar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDebouncedNavigation } from "@/features/shared/client";

const ALL_VEHICLES = "all";

export function ReportFilters({
  vehicles,
  fromValue,
  toValue,
  vehicleId,
}: {
  vehicles: { id: string; label: string }[];
  fromValue: string;
  toValue: string;
  vehicleId: string | null;
}) {
  const searchParams = useSearchParams();
  const { isPending, navigate, navigateNow } = useDebouncedNavigation();

  function urlFor(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (!value || value === ALL_VEHICLES) next.delete(key);
    else next.set(key, value);
    const search = next.toString();
    return search ? `/reports?${search}` : "/reports";
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="report-from">From</Label>
          <Input
            defaultValue={fromValue}
            id="report-from"
            type="date"
            // A native date input fires onChange per digit and per spinner
            // click, so typing one date used to cost up to eight navigations.
            // Debounce while typing; commit for real on blur.
            onBlur={(event) => navigateNow(urlFor("from", event.target.value))}
            onChange={(event) => navigate(urlFor("from", event.target.value))}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="report-to">To</Label>
          <Input
            defaultValue={toValue}
            id="report-to"
            type="date"
            onBlur={(event) => navigateNow(urlFor("to", event.target.value))}
            onChange={(event) => navigate(urlFor("to", event.target.value))}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="report-vehicle">Vehicle</Label>
          <Select
            value={vehicleId ?? ALL_VEHICLES}
            onValueChange={(value) => navigateNow(urlFor("vehicle_id", value))}
          >
            <SelectTrigger className="min-w-56" id="report-vehicle">
              <SelectValue placeholder="All vehicles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VEHICLES}>All vehicles</SelectItem>
              {vehicles.map((vehicle) => (
                <SelectItem key={vehicle.id} value={vehicle.id}>
                  {vehicle.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DataTableLoadingBar pending={isPending} />
    </div>
  );
}
