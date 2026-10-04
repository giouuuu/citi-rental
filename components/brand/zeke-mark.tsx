import { cn } from "@/lib/utils";

type ZekeMarkProps = {
  className?: string;
  /** Navy badge with a teal road for light UI; teal badge with a navy road for dark UI. */
  variant?: "teal" | "navy";
  /** Lane markings. Drop them below ~24px, where the dashes turn to noise. */
  lanes?: boolean;
  title?: string;
};

/** The Z drawn as one switchback road, as in Cebu's mountain highways. */
export const ZEKE_ROAD_PATH = "M10 14.5H31Q36.2 14.5 32.3 18L15.7 30Q11.8 33.5 17 33.5H38";
/** Same road, inset at both ends so the dashes stop inside the asphalt. */
export const ZEKE_LANE_PATH = "M12.5 14.5H31Q36.2 14.5 32.3 18L15.7 30Q11.8 33.5 17 33.5H35.5";

const palette = {
  navy: { badge: "#07111F", road: "#14B8A6", lane: "#F0FDFA" },
  teal: { badge: "#14B8A6", road: "#07111F", lane: "#F0FDFA" },
} as const;

/** Zeke Car Rentals brand mark for headers and favicon-scale UI. */
export function ZekeMark({
  className,
  variant = "teal",
  lanes = true,
  title = "Zeke Car Rentals",
}: ZekeMarkProps) {
  const colors = palette[variant];

  return (
    <svg
      aria-hidden={title ? undefined : true}
      className={cn("size-10 shrink-0", className)}
      fill="none"
      role={title ? "img" : undefined}
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      <rect fill={colors.badge} height="48" rx="12" width="48" />
      <path
        d={ZEKE_ROAD_PATH}
        stroke={colors.road}
        strokeLinejoin="round"
        strokeWidth="8.5"
      />
      {lanes ? (
        // Normalised length: 13 dash+gap periods plus a closing dash, so the
        // markings start and end on a full dash.
        <path
          d={ZEKE_LANE_PATH}
          pathLength={100}
          stroke={colors.lane}
          strokeDasharray="3.56 3.86"
          strokeWidth="1.15"
        />
      ) : null}
    </svg>
  );
}
