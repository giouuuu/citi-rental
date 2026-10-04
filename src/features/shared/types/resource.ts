import type { ZodType } from "zod";

import type { AppRole } from "@/features/shared/lib/app-roles";
import type { BlockedRange } from "@/features/shared/lib/booked-days";

export type { AppRole };

export type ResourceRow = Record<string, unknown> & { id: string };

export type ResourceOption = { label: string; value: string };

export type ResourceField = {
  name: string;
  label: string;
  type?:
    | "text"
    | "email"
    | "tel"
    | "url"
    | "number"
    | "date"
    | "datetime-local"
    | "date-range"
    | "textarea"
    | "select"
    | "checkbox"
    | "image";
  required?: boolean;
  placeholder?: string;
  description?: string;
  options?: ResourceOption[];
  reference?: {
    table: string;
    labelColumn: string;
    secondaryColumn?: string;
    activeColumn?: string;
    statusColumn?: string;
    excludeStatuses?: string[];
    equals?: Record<string, string | number | boolean>;
  };
  step?: string;
  className?: string;
  accept?: string;
  /** For `image`: the row column holding the current image URL. Defaults to `photo_url`. */
  previewColumn?: string;
  /**
   * For `date-range`: this field holds the start and `endField` the end, both
   * `YYYY-MM-DDTHH:mm`. The end field is edited here, not on its own.
   */
  range?: {
    endField: string;
    startLabel?: string;
    endLabel?: string;
    /**
     * Existing rows in `table` that share this form's `field` value (the chosen
     * vehicle, say) and sit in one of `statuses` block their days. Their dates
     * live in this field's and `endField`'s columns.
     */
    blockedBy?: {
      field: string;
      table: string;
      labelColumn?: string;
      statusColumn?: string;
      statuses: string[];
    };
  };
  /** Disable this field when another form field matches one of these values. */
  lockWhen?: {
    field: string;
    values: string[];
    message?: string;
  };
};

export type ResourceColumn = {
  key: string;
  label: string;
  format?:
    | "text"
    | "status"
    | "date"
    | "datetime"
    | "number"
    | "money"
    | "boolean"
    | "image";
};

/**
 * A URL param that narrows a list to matching rows (`?category=<id>`), so a
 * figure elsewhere can link straight to the rows behind it. Kept across
 * search, sort and paging.
 */
export type ResourceFilter = {
  param: string;
  column: string;
  op: "eq" | "gte" | "lte";
  label: string;
  /** Show the raw value in the active-filter chip (dates yes, ids no). */
  showValue?: boolean;
  /** Words for enum values in the chip, e.g. `due_soon` → "Due soon". */
  valueLabels?: Record<string, string>;
};

export type ResourceDefinition = {
  key: string;
  table: string;
  singular: string;
  plural: string;
  route: string;
  titleField: string;
  subtitleField?: string;
  searchColumn: string;
  description: string;
  fields: ResourceField[];
  columns: ResourceColumn[];
  detailColumns?: string[];
  schema: ZodType<Record<string, unknown>>;
  writeRoles: AppRole[];
  allowCreate?: boolean;
  archive?: { field: string; value: unknown; label: string };
  filters?: ResourceFilter[];
  /** Breadcrumb parent; defaults to the workspace dashboard. */
  parent?: { label: string; href: string };
  demoRows?: ResourceRow[];
};

export type ResourceActionState = {
  message?: string;
  success?: boolean;
  errors?: Record<string, string[]>;
};

export type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; message: string; fieldErrors?: Record<string, string[]> };

export type ResourceReferences = Record<string, ResourceOption[]>;

/**
 * Bookings that block a `date-range` field, by field name, then by the value
 * of the field they hang off (`{ start_at: { <vehicle id>: [...] } }`).
 */
export type ResourceBlockedRanges = Record<string, Record<string, BlockedRange[]>>;

export type ResourceQuery = {
  q: string;
  page: number;
  pageSize: number;
  sort: string;
  direction: "asc" | "desc";
  /** Active `ResourceFilter` values keyed by param. */
  filters?: Record<string, string>;
};

export type ResourcePage = {
  rows: ResourceRow[];
  page: number;
  pageSize: number;
  hasNextPage: boolean;
};
