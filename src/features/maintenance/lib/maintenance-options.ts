/** The two BIR lines a service can be booked under. */
export const MAINTENANCE_CATEGORIES = [
  { value: "repairs_labor", label: "Labor, or labor with parts", hint: "Shop servicing, PMS, aircon cleaning." },
  { value: "repairs_materials", label: "Parts and supplies only", hint: "Tires, batteries, oil bought outright." },
] as const;

/** Receipt types a repair shop issues; payroll does not apply here. */
export const MAINTENANCE_DOCUMENT_TYPES = [
  { value: "vat_invoice", label: "VAT invoice" },
  { value: "non_vat_invoice", label: "Non-VAT invoice" },
  { value: "acknowledgement_receipt", label: "Acknowledgement receipt" },
  { value: "none", label: "No receipt" },
] as const;

export const MAINTENANCE_ROUTE = "/maintenance";

/** Most urgent first; see `urgency` in vehicle_maintenance_due. */
export const MAINTENANCE_FALLBACK_SORT = "urgency";

/**
 * Sortable columns and URL filters of the fleet Maintenance page, in the shape
 * `parseResourceQuery` reads. The first column is the fallback sort.
 */
export const MAINTENANCE_LIST = {
  columns: [
    { key: MAINTENANCE_FALLBACK_SORT, label: "Status" },
    { key: "plate_number", label: "Car" },
    { key: "name", label: "Service" },
    { key: "last_done_on", label: "Last done" },
    { key: "next_due_on", label: "Next due" },
  ],
  filters: [
    { param: "status", column: "status", op: "eq" as const, label: "Status" },
    { param: "vehicle", column: "vehicle_id", op: "eq" as const, label: "One car" },
  ],
};
