import type {
  ActionResult,
  ResourceBlockedRanges,
  ResourceDefinition,
  ResourceReferences,
  ResourceRow,
} from "@/features/shared/types/resource";

export type ResourceFormProps = {
  definition: Pick<ResourceDefinition, "key" | "singular" | "fields">;
  row?: ResourceRow | null;
  references?: ResourceReferences;
  /** Existing bookings for `date-range` fields; see `loadResourceBlockedRanges`. */
  blockedRanges?: ResourceBlockedRanges;
  action: (
    formData: FormData,
  ) => Promise<ActionResult<{ id: string; href: string }>>;
  readOnly?: boolean;
  /** Prefill for a new record (`?vehicle_id=…` links, dialogs). Ignored when `row` is set. */
  initialValues?: Record<string, string>;
  /** Submitted with the form but not shown, e.g. the vehicle a dialog was opened from. */
  hiddenFields?: string[];
  /** Called after a successful save instead of navigating to the new record. */
  onSuccess?: () => void;
  /** Drop the card chrome when the form sits inside a dialog. */
  bare?: boolean;
};
