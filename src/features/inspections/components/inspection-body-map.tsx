"use client";

import { cn } from "@/lib/utils";
import type { InspectionItemStatus } from "@/features/inspections/types/inspection";
import { isDamageStatus } from "@/features/inspections/lib/checklist-areas";

type ZoneState = {
  zone: string;
  status: InspectionItemStatus;
};

const ZONES: Array<{
  id: string;
  d: string;
  label: string;
}> = [
  { id: "front_bumper", label: "Front bumper", d: "M78 18 H122 L132 34 H68 Z" },
  { id: "hood", label: "Hood", d: "M72 34 H128 V62 H72 Z" },
  { id: "windshield", label: "Windshield", d: "M74 62 H126 V78 H74 Z" },
  { id: "roof", label: "Roof", d: "M76 78 H124 V118 H76 Z" },
  { id: "glass_rear", label: "Rear glass", d: "M74 118 H126 V132 H74 Z" },
  { id: "trunk", label: "Trunk", d: "M72 132 H128 V158 H72 Z" },
  { id: "rear_bumper", label: "Rear bumper", d: "M68 158 H132 L122 174 H78 Z" },
  { id: "fender_fl", label: "FL fender", d: "M48 34 H72 V62 H48 Z" },
  { id: "fender_fr", label: "FR fender", d: "M128 34 H152 V62 H128 Z" },
  { id: "door_fl", label: "FL door", d: "M48 62 H76 V98 H48 Z" },
  { id: "door_fr", label: "FR door", d: "M124 62 H152 V98 H124 Z" },
  { id: "door_rl", label: "RL door", d: "M48 98 H76 V132 H48 Z" },
  { id: "door_rr", label: "RR door", d: "M124 98 H152 V132 H124 Z" },
  { id: "fender_rl", label: "RL quarter", d: "M48 132 H72 V158 H48 Z" },
  { id: "fender_rr", label: "RR quarter", d: "M128 132 H152 V158 H128 Z" },
  { id: "mirror_l", label: "L mirror", d: "M38 70 H48 V82 H38 Z" },
  { id: "mirror_r", label: "R mirror", d: "M152 70 H162 V82 H152 Z" },
  { id: "headlights", label: "Headlights", d: "M70 24 H84 V32 H70 Z M116 24 H130 V32 H116 Z" },
  { id: "taillights", label: "Taillights", d: "M70 164 H84 V172 H70 Z M116 164 H130 V172 H116 Z" },
  { id: "tire_fl", label: "FL tire", d: "M40 40 H50 V58 H40 Z" },
  { id: "tire_fr", label: "FR tire", d: "M150 40 H160 V58 H150 Z" },
  { id: "tire_rl", label: "RL tire", d: "M40 140 H50 V158 H40 Z" },
  { id: "tire_rr", label: "RR tire", d: "M150 140 H160 V158 H150 Z" },
];

function fillFor(status: InspectionItemStatus | undefined) {
  if (!status || status === "ok") return "color-mix(in oklab, var(--color-muted) 70%, white)";
  if (isDamageStatus(status)) {
    return "color-mix(in oklab, var(--color-destructive) 35%, white)";
  }
  return "color-mix(in oklab, var(--color-muted) 70%, white)";
}

export function InspectionBodyMap({
  zones,
  selectedZone,
  onSelect,
  className,
}: {
  zones: ZoneState[];
  selectedZone?: string | null;
  onSelect?: (zone: string) => void;
  className?: string;
}) {
  const byZone = new Map(zones.map((entry) => [entry.zone, entry.status]));

  return (
    <div className={cn("rounded-lg border border-border bg-muted/20 p-3", className)}>
      <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Body map — tap a panel
      </p>
      <svg
        aria-label="Vehicle body condition map"
        className="mx-auto h-auto w-full max-w-xs"
        role="img"
        viewBox="0 0 200 190"
      >
        {ZONES.map((zone) => {
          const status = byZone.get(zone.id);
          const selected = selectedZone === zone.id;
          return (
            <path
              key={zone.id}
              d={zone.d}
              fill={fillFor(status)}
              role={onSelect ? "button" : undefined}
              stroke={selected ? "var(--color-brand-700, #0f766e)" : "var(--color-border)"}
              strokeWidth={selected ? 2.5 : 1}
              tabIndex={onSelect ? 0 : undefined}
              onClick={() => onSelect?.(zone.id)}
              onKeyDown={(event) => {
                if (!onSelect) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(zone.id);
                }
              }}
            >
              <title>{zone.label}</title>
            </path>
          );
        })}
      </svg>
    </div>
  );
}
