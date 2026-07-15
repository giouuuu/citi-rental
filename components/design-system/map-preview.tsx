import { CircleParking, Navigation, SignalZero } from "lucide-react";

import { cn } from "@/lib/utils";

const markers = [
  { left: "19%", top: "36%", status: "moving" },
  { left: "52%", top: "22%", status: "parked" },
  { left: "73%", top: "58%", status: "offline" },
  { left: "38%", top: "68%", status: "moving" },
] as const;

const markerConfig = {
  moving: { icon: Navigation, className: "bg-primary text-white" },
  parked: { icon: CircleParking, className: "bg-brand-500 text-white" },
  offline: { icon: SignalZero, className: "bg-offline text-white" },
};

export function MapPreview({ className }: { className?: string }) {
  return (
    <div
      aria-label="Fleet map preview showing four vehicle status markers"
      className={cn(
        "map-grid relative min-h-80 overflow-hidden rounded-lg border border-border",
        className,
      )}
      role="img"
    >
      <svg
        aria-hidden="true"
        className="absolute inset-0 size-full opacity-80"
        preserveAspectRatio="none"
        viewBox="0 0 800 420"
      >
        <path
          d="M-20 330 C150 245 215 395 400 275 S635 165 835 225"
          fill="none"
          stroke="#fff"
          strokeWidth="34"
        />
        <path
          d="M90 -20 C175 90 155 185 270 235 S475 250 525 445"
          fill="none"
          stroke="#fff"
          strokeWidth="20"
        />
        <path
          d="M-15 110 C160 140 280 95 410 120 S670 165 820 70"
          fill="none"
          stroke="#cbdbe2"
          strokeWidth="6"
        />
        <path
          d="M105 320 C235 250 335 305 425 245"
          fill="none"
          stroke="#14968b"
          strokeLinecap="round"
          strokeWidth="5"
        />
      </svg>
      {markers.map((marker, index) => {
        const config = markerConfig[marker.status];
        const Icon = config.icon;

        return (
          <div
            className={cn(
              "absolute flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white shadow-md",
              config.className,
            )}
            key={`${marker.left}-${marker.top}`}
            style={{ left: marker.left, top: marker.top }}
          >
            <Icon aria-hidden="true" className="size-4" />
            <span className="sr-only">
              Vehicle {index + 1}: {marker.status}
            </span>
          </div>
        );
      })}
      <div className="absolute right-3 bottom-3 flex flex-wrap gap-3 rounded-md border border-white/80 bg-white/95 px-3 py-2 text-[11px] font-medium text-brand-700 shadow-sm">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-primary" /> Moving
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-brand-500" /> Parked
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-offline" /> Offline
        </span>
      </div>
    </div>
  );
}
