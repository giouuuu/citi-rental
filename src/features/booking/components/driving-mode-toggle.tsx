"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  parseDrivingMode,
  type DrivingMode,
} from "@/features/booking/lib/driving-mode";
import { formatPhp } from "@/features/shared/lib/money";
import { cn } from "@/lib/utils";

/**
 * Self-drive or with a driver, as a two-way switch. With the owner's driver
 * rate set, the driver option names its price so the choice is informed.
 */
export function DrivingModeToggle({
  value,
  onChange,
  driverDailyRate,
  disabled,
  className,
  "aria-label": ariaLabel = "Driving option",
}: {
  value: DrivingMode;
  onChange: (mode: DrivingMode) => void;
  driverDailyRate?: number | null;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <Tabs
      className={className}
      onValueChange={(next) => onChange(parseDrivingMode(next))}
      value={value}
    >
      <TabsList
        aria-label={ariaLabel}
        className="h-auto! w-full rounded-xl bg-brand-950/[0.05] p-1"
      >
        <TabsTrigger
          className="h-auto flex-1 flex-col gap-0 rounded-lg px-3 py-2"
          disabled={disabled}
          value="self-drive"
        >
          <span className="text-sm font-semibold">Self-drive</span>
          <span className="text-xs font-normal text-muted-foreground">
            You drive
          </span>
        </TabsTrigger>
        <TabsTrigger
          className="h-auto flex-1 flex-col gap-0 rounded-lg px-3 py-2"
          disabled={disabled}
          value="with-driver"
        >
          <span className="text-sm font-semibold">With driver</span>
          <span
            className={cn(
              "text-xs font-normal text-muted-foreground tabular-nums",
            )}
          >
            {driverDailyRate
              ? `+${formatPhp(driverDailyRate)} / day`
              : "A local driver"}
          </span>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
