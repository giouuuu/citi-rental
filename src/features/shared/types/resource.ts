import type { ZodType } from "zod";

import type { AppRole } from "@/features/shared/lib/app-roles";

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
    | "boolean"
    | "image";
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

export type ResourceQuery = {
  q: string;
  page: number;
  pageSize: number;
  sort: string;
  direction: "asc" | "desc";
};

export type ResourcePage = {
  rows: ResourceRow[];
  page: number;
  pageSize: number;
  hasNextPage: boolean;
};
