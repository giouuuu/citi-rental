import { cn } from "@/lib/utils";

type ZekeMarkProps = {
  className?: string;
  /** Teal badge on dark UI, or navy badge on light UI. */
  variant?: "teal" | "navy";
  title?: string;
};

/**
 * Geometric Z monogram with a route cut through the diagonal —
 * Zeke Car Rentals brand mark for headers and favicon-scale UI.
 */
export function ZekeMark({
  className,
  variant = "teal",
  title = "Zeke Car Rentals",
}: ZekeMarkProps) {
  const isTeal = variant === "teal";
  const badge = isTeal ? "#2DD4BF" : "#07111F";
  const ink = isTeal ? "#07111F" : "#2DD4BF";

  return (
    <svg
      aria-hidden={title ? undefined : true}
      className={cn("size-10 shrink-0", className)}
      fill="none"
      role={title ? "img" : undefined}
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      <rect fill={badge} height="40" rx="8" width="40" />
      {/* Bold geometric Z */}
      <path
        d="M9 10h22v5.25L16.75 24.5H31V30H9v-5.25L22.25 15.25H9V10Z"
        fill={ink}
      />
      {/* Route stripe + destination pin through the diagonal */}
      <path
        d="M13.5 19.25 26.5 28.5"
        stroke={badge}
        strokeLinecap="round"
        strokeWidth="2.75"
      />
      <circle cx="26.5" cy="28.5" fill={ink} r="2.1" stroke={badge} strokeWidth="1.4" />
    </svg>
  );
}
