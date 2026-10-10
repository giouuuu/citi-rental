/** Self-drive, or the car comes with one of the company's drivers. */
export const DRIVING_MODES = ["self-drive", "with-driver"] as const;

export type DrivingMode = (typeof DRIVING_MODES)[number];

/** Anything other than `with-driver` (a typo, an old link) is self-drive. */
export function parseDrivingMode(value?: string | null): DrivingMode {
  return value === "with-driver" ? "with-driver" : "self-drive";
}
