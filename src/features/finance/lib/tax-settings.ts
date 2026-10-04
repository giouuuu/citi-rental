import type {
  EntityType,
  GraduatedBracket,
  IncomeTaxElection,
  TaxSettings,
} from "@/features/finance/lib/income-tax";

/** Mirrors the column defaults in 20261005090000_financial_statements.sql. */
export const DEFAULT_TAX_SETTINGS: TaxSettings = {
  registeredName: "",
  tin: "",
  rdoCode: "",
  registeredAddress: "",
  entityType: "sole_proprietor",
  vatRegistered: false,
  vatRate: 0.12,
  percentageTaxRate: 0.03,
  incomeTaxElection: null,
  eightPercentRate: 0.08,
  eightPercentExemption: 250_000,
  osdRate: 0.4,
  vatThreshold: 3_000_000,
  corporateIncomeTaxRate: 0.25,
  graduatedBrackets: [
    { over: 0, base: 0, rate: 0 },
    { over: 250_000, base: 0, rate: 0.15 },
    { over: 400_000, base: 22_500, rate: 0.2 },
    { over: 800_000, base: 102_500, rate: 0.25 },
    { over: 2_000_000, base: 402_500, rate: 0.3 },
    { over: 8_000_000, base: 2_202_500, rate: 0.35 },
  ],
  fiscalYearStartMonth: 1,
};

const ENTITY_TYPES: EntityType[] = ["sole_proprietor", "partnership", "corporation"];
const ELECTIONS: IncomeTaxElection[] = ["eight_percent", "graduated_osd", "graduated_itemized"];

function numberOr(value: unknown, fallback: number) {
  const parsed = Number(value);
  return value === null || value === undefined || !Number.isFinite(parsed) ? fallback : parsed;
}

function parseBrackets(value: unknown): GraduatedBracket[] {
  if (!Array.isArray(value)) return DEFAULT_TAX_SETTINGS.graduatedBrackets;
  const brackets = value
    .map((item) => ({
      over: Number((item as GraduatedBracket).over),
      base: Number((item as GraduatedBracket).base),
      rate: Number((item as GraduatedBracket).rate),
    }))
    .filter((item) => [item.over, item.base, item.rate].every(Number.isFinite));
  return brackets.length ? brackets : DEFAULT_TAX_SETTINGS.graduatedBrackets;
}

/** A `tax_settings` row -> settings, tolerating nulls and numeric strings. */
export function taxSettingsFromRow(row: Record<string, unknown> | null | undefined): TaxSettings {
  if (!row) return DEFAULT_TAX_SETTINGS;
  const d = DEFAULT_TAX_SETTINGS;
  const entityType = ENTITY_TYPES.includes(row.entity_type as EntityType)
    ? (row.entity_type as EntityType)
    : d.entityType;
  const election = ELECTIONS.includes(row.income_tax_election as IncomeTaxElection)
    ? (row.income_tax_election as IncomeTaxElection)
    : null;
  return {
    registeredName: String(row.registered_name ?? ""),
    tin: String(row.tin ?? ""),
    rdoCode: String(row.rdo_code ?? ""),
    registeredAddress: String(row.registered_address ?? ""),
    entityType,
    vatRegistered: Boolean(row.vat_registered),
    vatRate: numberOr(row.vat_rate, d.vatRate),
    percentageTaxRate: numberOr(row.percentage_tax_rate, d.percentageTaxRate),
    incomeTaxElection: election,
    eightPercentRate: numberOr(row.eight_percent_rate, d.eightPercentRate),
    eightPercentExemption: numberOr(row.eight_percent_exemption, d.eightPercentExemption),
    osdRate: numberOr(row.osd_rate, d.osdRate),
    vatThreshold: numberOr(row.vat_threshold, d.vatThreshold),
    corporateIncomeTaxRate: numberOr(row.corporate_income_tax_rate, d.corporateIncomeTaxRate),
    graduatedBrackets: parseBrackets(row.graduated_brackets),
    fiscalYearStartMonth: Math.min(12, Math.max(1, numberOr(row.fiscal_year_start_month, 1))),
  };
}
