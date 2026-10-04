/**
 * Tax position arithmetic. Every rate comes from `tax_settings`, never from
 * this file, because Philippine rates have moved repeatedly. This produces
 * figures for the accountant to confirm; it is not a filing.
 */

export type EntityType = "sole_proprietor" | "partnership" | "corporation";
export type IncomeTaxElection = "eight_percent" | "graduated_osd" | "graduated_itemized";

export type GraduatedBracket = { over: number; base: number; rate: number };

export type TaxSettings = {
  registeredName: string;
  tin: string;
  rdoCode: string;
  registeredAddress: string;
  entityType: EntityType;
  vatRegistered: boolean;
  vatRate: number;
  percentageTaxRate: number;
  incomeTaxElection: IncomeTaxElection | null;
  eightPercentRate: number;
  eightPercentExemption: number;
  osdRate: number;
  vatThreshold: number;
  corporateIncomeTaxRate: number;
  graduatedBrackets: GraduatedBracket[];
  fiscalYearStartMonth: number;
};

export type ElectionOption =
  | "eight_percent"
  | "graduated_osd"
  | "graduated_itemized"
  | "corporate_osd"
  | "corporate_itemized";

export type ElectionRow = {
  option: ElectionOption;
  label: string;
  taxableIncome: number;
  incomeTax: number;
  /** Percentage tax that comes with this option (8% is in lieu of it). */
  percentageTax: number;
  totalTax: number;
  eligible: boolean;
  reason: string | null;
  elected: boolean;
  /** The lowest total among eligible options. */
  lowest: boolean;
};

export type BusinessTax =
  | {
      kind: "vat";
      form: "2550Q";
      outputVat: number;
      creditableInputVat: number;
      /** Negative means excess input VAT carried over. */
      payable: number;
    }
  | {
      kind: "percentage";
      form: "2551Q";
      base: number;
      rate: number;
      due: number;
      waivedByEightPercent: boolean;
    };

const round = (value: number) => Math.round(value * 100) / 100;

/** Annual graduated income tax: base + rate x (taxable - over). */
export function graduatedTax(taxable: number, brackets: GraduatedBracket[]): number {
  if (taxable <= 0 || brackets.length === 0) return 0;
  const sorted = [...brackets].sort((a, b) => a.over - b.over);
  let bracket = sorted[0];
  for (const candidate of sorted) {
    if (taxable > candidate.over) bracket = candidate;
  }
  return round(bracket.base + bracket.rate * (taxable - bracket.over));
}

/** Corporations, and partnerships taxed as corporations, have no 8% option. */
export function isIndividual(entityType: EntityType) {
  return entityType === "sole_proprietor";
}

/**
 * Income tax under each available election, side by side, so the choice is a
 * visible number instead of a guess.
 *
 * `grossReceipts` is the income-tax base (net of VAT when VAT-registered).
 * `deductions` are itemized deductions INCLUDING depreciation and EXCLUDING
 * amounts flagged at risk of disallowance.
 *
 * The 8% exemption, the brackets and the VAT threshold are annual figures: run
 * this on a full year, or year-to-date for the cumulative 1701Q.
 */
export function compareElections({
  grossReceipts,
  deductions,
  settings,
}: {
  grossReceipts: number;
  deductions: number;
  settings: TaxSettings;
}): ElectionRow[] {
  const gross = Math.max(0, grossReceipts);
  const percentageTax = settings.vatRegistered ? 0 : round(gross * settings.percentageTaxRate);
  const rows: Omit<ElectionRow, "lowest">[] = [];

  if (isIndividual(settings.entityType)) {
    const eightEligible = !settings.vatRegistered && gross <= settings.vatThreshold;
    const eightTaxable = Math.max(0, gross - settings.eightPercentExemption);
    const eightTax = round(eightTaxable * settings.eightPercentRate);
    rows.push({
      option: "eight_percent",
      label: `${pct(settings.eightPercentRate)} on gross receipts`,
      taxableIncome: round(eightTaxable),
      incomeTax: eightTax,
      percentageTax: 0,
      totalTax: eightTax,
      eligible: eightEligible,
      reason: settings.vatRegistered
        ? "Not available to VAT-registered taxpayers."
        : gross > settings.vatThreshold
          ? "Gross receipts exceed the VAT threshold."
          : null,
      elected: settings.incomeTaxElection === "eight_percent",
    });

    const osdTaxable = round(gross * (1 - settings.osdRate));
    const osdTax = graduatedTax(osdTaxable, settings.graduatedBrackets);
    rows.push({
      option: "graduated_osd",
      label: `Graduated rates with ${pct(settings.osdRate)} OSD`,
      taxableIncome: osdTaxable,
      incomeTax: osdTax,
      percentageTax,
      totalTax: round(osdTax + percentageTax),
      eligible: true,
      reason: null,
      elected: settings.incomeTaxElection === "graduated_osd",
    });

    const itemizedTaxable = round(Math.max(0, gross - deductions));
    const itemizedTax = graduatedTax(itemizedTaxable, settings.graduatedBrackets);
    rows.push({
      option: "graduated_itemized",
      label: "Graduated rates with itemized deductions",
      taxableIncome: itemizedTaxable,
      incomeTax: itemizedTax,
      percentageTax,
      totalTax: round(itemizedTax + percentageTax),
      eligible: true,
      reason: null,
      elected: settings.incomeTaxElection === "graduated_itemized",
    });
  } else {
    const rate = settings.corporateIncomeTaxRate;
    const osdTaxable = round(gross * (1 - settings.osdRate));
    const osdTax = round(osdTaxable * rate);
    rows.push({
      option: "corporate_osd",
      label: `${pct(rate)} with ${pct(settings.osdRate)} OSD`,
      taxableIncome: osdTaxable,
      incomeTax: osdTax,
      percentageTax,
      totalTax: round(osdTax + percentageTax),
      eligible: true,
      reason: "OSD for corporations is on gross income (receipts less cost of services).",
      elected: settings.incomeTaxElection === "graduated_osd",
    });

    const itemizedTaxable = round(Math.max(0, gross - deductions));
    const itemizedTax = round(itemizedTaxable * rate);
    rows.push({
      option: "corporate_itemized",
      label: `${pct(rate)} with itemized deductions`,
      taxableIncome: itemizedTaxable,
      incomeTax: itemizedTax,
      percentageTax,
      totalTax: round(itemizedTax + percentageTax),
      eligible: true,
      reason: null,
      elected: settings.incomeTaxElection === "graduated_itemized",
    });
  }

  const lowest = Math.min(...rows.filter((row) => row.eligible).map((row) => row.totalTax));
  return rows.map((row) => ({ ...row, lowest: row.eligible && row.totalTax === lowest }));
}

/** VAT (2550Q) when registered; otherwise percentage tax (2551Q). */
export function businessTax({
  grossReceipts,
  outputVat,
  creditableInputVat,
  settings,
}: {
  grossReceipts: number;
  outputVat: number;
  creditableInputVat: number;
  settings: TaxSettings;
}): BusinessTax {
  if (settings.vatRegistered) {
    return {
      kind: "vat",
      form: "2550Q",
      outputVat: round(outputVat),
      creditableInputVat: round(creditableInputVat),
      payable: round(outputVat - creditableInputVat),
    };
  }
  const waived =
    isIndividual(settings.entityType) && settings.incomeTaxElection === "eight_percent";
  const base = Math.max(0, grossReceipts);
  return {
    kind: "percentage",
    form: "2551Q",
    base: round(base),
    rate: settings.percentageTaxRate,
    due: waived ? 0 : round(base * settings.percentageTaxRate),
    waivedByEightPercent: waived,
  };
}

/** Income tax return family for the entity. */
export function incomeTaxForms(entityType: EntityType) {
  return isIndividual(entityType)
    ? { quarterly: "1701Q", annual: "1701 / 1701A" }
    : { quarterly: "1702Q", annual: "1702" };
}

export function pct(rate: number) {
  return `${Math.round(rate * 10_000) / 100}%`;
}
