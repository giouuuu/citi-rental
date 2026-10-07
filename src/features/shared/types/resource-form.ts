import type {
  ActionResult,
  ResourceBlockedRanges,
  ResourceDefinition,
  ResourceReferences,
  ResourceRow,
} from "@/features/shared/types/resource";

type SaveResourceAction = (
  formData: FormData,
) => Promise<ActionResult<{ id: string; href: string }>>;

/**
 * Create the record a `select` field points at without leaving the form, e.g.
 * a new customer while booking a rental. The new record is selected on save.
 */
export type ResourceQuickCreate = {
  /** Button text, e.g. "New customer". */
  label: string;
  definition: Pick<ResourceDefinition, "key" | "singular" | "fields">;
  action: SaveResourceAction;
  /** One line under the dialog title. */
  description?: string;
  /** Fields left out of the short form; they can be filled in later. */
  hiddenFields?: string[];
  /** Field the dropdown's search text pre-fills, e.g. `full_name`. */
  searchField?: string;
};

export type ResourceFormProps = {
  definition: Pick<ResourceDefinition, "key" | "singular" | "fields">;
  row?: ResourceRow | null;
  references?: ResourceReferences;
  /** Existing bookings for `date-range` fields; see `loadResourceBlockedRanges`. */
  blockedRanges?: ResourceBlockedRanges;
  action: SaveResourceAction;
  readOnly?: boolean;
  /** Prefill for a new record (`?vehicle_id=…` links, dialogs). Ignored when `row` is set. */
  initialValues?: Record<string, string>;
  /** Submitted with the form but not shown, e.g. the vehicle a dialog was opened from. */
  hiddenFields?: string[];
  /** Called after a successful save instead of navigating to the new record. */
  onSuccess?: (
    saved: { id: string; href: string } | undefined,
    values: Record<string, unknown>,
  ) => void;
  /** Quick-create buttons for `select` fields, by field name. */
  quickCreate?: Record<string, ResourceQuickCreate>;
  /** Drop the card chrome when the form sits inside a dialog. */
  bare?: boolean;
};
