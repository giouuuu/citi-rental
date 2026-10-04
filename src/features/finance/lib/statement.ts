import {
  bookValueAt,
  depreciationBetween,
  depreciationSchedule,
  type FixedAsset,
} from "@/features/finance/lib/depreciation";
import {
  businessTax,
  compareElections,
  incomeTaxForms,
  type BusinessTax,
  type ElectionRow,
  type TaxSettings,
} from "@/features/finance/lib/income-tax";
import { toMoney } from "@/features/shared/lib/money";

/** Raw `finance_statement` payload (snake_case, numerics as JSON numbers). */
export type StatementPayload = {
  receipts: Record<string, number | string>;
  withholding: Record<string, number | string>;
  expenses: Record<string, unknown>[];
  vehicles: Record<string, unknown>[];
  monthly: Record<string, unknown>[];
  exceptions: Record<string, unknown>[];
};

export type ExpenseLine = {
  categoryId: string;
  code: string;
  name: string;
  birLine: string;
  entries: number;
  gross: number;
  inputVat: number;
  net: number;
  creditableInputVat: number;
  ewt: number;
  atRisk: number;
};

export type DepreciationRow = {
  asset: FixedAsset;
  inPeriod: number;
  accumulated: number;
  bookValue: number;
};

export type VehicleMargin = {
  vehicleId: string;
  plateNumber: string;
  name: string;
  status: string;
  receipts: number;
  expenses: number;
  depreciation: number;
  margin: number;
  hasAsset: boolean;
};

export type MonthLine = {
  month: string;
  netReceipts: number;
  outputVat: number;
  expensesNet: number;
  creditableInputVat: number;
  ewt: number;
};

export type ExceptionKind =
  | "missing_document"
  | "withholding_not_remitted"
  | "vehicle_without_cost"
  | "input_vat_not_creditable"
  | "missing_supplier_tin"
  | "certificate_pending"
  | "withholding_expected";

export type ExceptionRow = {
  kind: ExceptionKind;
  severity: "high" | "medium" | "low";
  recordType: "expense" | "vehicle" | "certificate";
  recordId: string;
  label: string;
  amount: number | null;
  occurredOn: string | null;
};

export type ExceptionGroup = {
  kind: ExceptionKind;
  severity: ExceptionRow["severity"];
  title: string;
  why: string;
  rows: ExceptionRow[];
  total: number;
};

export type FinanceStatement = {
  receipts: {
    grossCollected: number;
    refunds: number;
    netReceipts: number;
    vatable: number;
    zeroRated: number;
    exempt: number;
    nonVat: number;
    outputVat: number;
    netOfVat: number;
    publicWeb: number;
    ops: number;
    penaltiesBilled: number;
    outstandingBalance: number;
    paymentCount: number;
    /** Tax clients withheld at source (2307s), added back to gross receipts. */
    cwtWithheld: number;
    /** Income-tax base: receipts net of VAT plus tax withheld at source. */
    incomeTaxBase: number;
  };
  expenses: {
    lines: ExpenseLine[];
    net: number;
    inputVat: number;
    creditableInputVat: number;
    ewt: number;
    atRisk: number;
  };
  depreciation: { rows: DepreciationRow[]; total: number };
  incomeStatement: {
    revenue: number;
    operatingExpenses: number;
    depreciation: number;
    netIncome: number;
    /** Deductions flagged at risk of disallowance (Block E). */
    atRisk: number;
    /** Net income if the at-risk deductions are disallowed. */
    netIncomeIfDisallowed: number;
  };
  vehicles: VehicleMargin[];
  monthly: MonthLine[];
  tax: {
    business: BusinessTax;
    elections: ElectionRow[];
    allowableDeductions: number;
    cwt: { withheld: number; received: number; pending: number; incomePayments: number };
    ewt: { withheld: number; unremitted: number };
    forms: { quarterly: string; annual: string };
  };
  exceptions: { groups: ExceptionGroup[]; count: number; highCount: number };
};

export const EXCEPTION_COPY: Record<ExceptionKind, { title: string; why: string }> = {
  missing_document: {
    title: "No valid invoice or receipt",
    why: "BIR disallows a deduction without a valid supporting document. Record the invoice number or attach the document.",
  },
  withholding_not_remitted: {
    title: "Withholding not remitted",
    why: "When required withholding is not withheld and remitted (0619E / 1601EQ), BIR disallows the whole deduction, not just the tax.",
  },
  vehicle_without_cost: {
    title: "Vehicle with no acquisition cost",
    why: "No register entry means no depreciation, usually the largest deduction for a fleet.",
  },
  input_vat_not_creditable: {
    title: "Input VAT not creditable",
    why: "Only VAT shown on a VAT invoice from a VAT-registered supplier can be credited.",
  },
  missing_supplier_tin: {
    title: "Supplier TIN missing",
    why: "Invoices must carry the supplier's TIN, and the summary list of purchases needs it.",
  },
  certificate_pending: {
    title: "2307 not yet received",
    why: "Tax was withheld by a client but the certificate is not in hand. Without it the credit cannot be claimed.",
  },
  withholding_expected: {
    title: "Withholding usually required",
    why: "Payments in this category are normally subject to expanded withholding tax. Confirm it does not apply.",
  },
};

const num = (value: unknown) => toMoney(value);
const round = (value: number) => Math.round(value * 100) / 100;

function parseExpenseLine(raw: Record<string, unknown>): ExpenseLine {
  return {
    categoryId: String(raw.category_id),
    code: String(raw.code),
    name: String(raw.name),
    birLine: String(raw.bir_line),
    entries: Number(raw.entries ?? 0),
    gross: num(raw.gross),
    inputVat: num(raw.input_vat),
    net: num(raw.net),
    creditableInputVat: num(raw.creditable_input_vat),
    ewt: num(raw.ewt),
    atRisk: num(raw.at_risk),
  };
}

function parseException(raw: Record<string, unknown>): ExceptionRow {
  return {
    kind: raw.kind as ExceptionKind,
    severity: raw.severity as ExceptionRow["severity"],
    recordType: raw.record_type as ExceptionRow["recordType"],
    recordId: String(raw.record_id),
    label: String(raw.label ?? ""),
    amount: raw.amount === null || raw.amount === undefined ? null : num(raw.amount),
    occurredOn: raw.occurred_on ? String(raw.occurred_on) : null,
  };
}

const sum = (values: number[]) => round(values.reduce((total, value) => total + value, 0));

/**
 * Assembles the five statement blocks from the SQL snapshot, the asset
 * register and the tax settings. Pure: everything the accountant sees is a
 * function of these inputs, so it can be tested and exported identically.
 */
export function buildStatement({
  payload,
  assets,
  settings,
  window,
}: {
  payload: StatementPayload;
  assets: FixedAsset[];
  settings: TaxSettings;
  window: { from: string; to: string };
}): FinanceStatement {
  const r = payload.receipts;
  const w = payload.withholding;
  const cwtWithheld = num(w.cwt_withheld);
  const netOfVat = num(r.net_of_vat);

  const receipts: FinanceStatement["receipts"] = {
    grossCollected: num(r.gross_collected),
    refunds: num(r.refunds),
    netReceipts: num(r.net_receipts),
    vatable: num(r.vatable),
    zeroRated: num(r.zero_rated),
    exempt: num(r.exempt),
    nonVat: num(r.non_vat),
    outputVat: num(r.output_vat),
    netOfVat,
    publicWeb: num(r.public_web),
    ops: num(r.ops),
    penaltiesBilled: num(r.penalties_billed),
    outstandingBalance: num(r.outstanding_balance),
    paymentCount: Number(r.payment_count ?? 0),
    cwtWithheld,
    incomeTaxBase: round(netOfVat + cwtWithheld),
  };

  const lines = payload.expenses.map(parseExpenseLine);
  const expenses: FinanceStatement["expenses"] = {
    lines,
    net: sum(lines.map((line) => line.net)),
    inputVat: sum(lines.map((line) => line.inputVat)),
    creditableInputVat: sum(lines.map((line) => line.creditableInputVat)),
    ewt: sum(lines.map((line) => line.ewt)),
    atRisk: sum(lines.map((line) => line.atRisk)),
  };

  const depreciationRows: DepreciationRow[] = assets
    .map((asset) => {
      const schedule = depreciationSchedule(asset);
      return {
        asset,
        inPeriod: depreciationBetween(schedule, window.from, window.to),
        ...bookValueAt(asset, schedule, window.to),
      };
    })
    .filter((row) => row.asset.acquisitionDate <= window.to);
  const depreciationTotal = sum(depreciationRows.map((row) => row.inPeriod));

  const netIncome = round(receipts.incomeTaxBase - expenses.net - depreciationTotal);
  const incomeStatement: FinanceStatement["incomeStatement"] = {
    revenue: receipts.incomeTaxBase,
    operatingExpenses: expenses.net,
    depreciation: depreciationTotal,
    netIncome,
    atRisk: expenses.atRisk,
    netIncomeIfDisallowed: round(netIncome + expenses.atRisk),
  };

  const depreciationByVehicle = new Map<string, number>();
  for (const row of depreciationRows) {
    if (!row.asset.vehicleId) continue;
    depreciationByVehicle.set(row.asset.vehicleId, row.inPeriod);
  }
  const vehicles: VehicleMargin[] = payload.vehicles
    .map((raw) => {
      const vehicleId = String(raw.vehicle_id);
      const receiptsNet = num(raw.receipts_net_of_vat);
      const expensesNet = num(raw.expenses_net);
      const depreciation = depreciationByVehicle.get(vehicleId) ?? 0;
      return {
        vehicleId,
        plateNumber: String(raw.plate_number ?? ""),
        name: String(raw.name ?? ""),
        status: String(raw.status ?? ""),
        receipts: receiptsNet,
        expenses: expensesNet,
        depreciation,
        margin: round(receiptsNet - expensesNet - depreciation),
        hasAsset: assets.some((asset) => asset.vehicleId === vehicleId),
      };
    })
    // Retired units with nothing in the period are noise.
    .filter((row) => row.status !== "inactive" || row.receipts !== 0 || row.expenses !== 0 || row.depreciation !== 0)
    .sort((a, b) => a.margin - b.margin);

  const monthly: MonthLine[] = payload.monthly.map((raw) => ({
    month: String(raw.month),
    netReceipts: num(raw.net_receipts),
    outputVat: num(raw.output_vat),
    expensesNet: num(raw.expenses_net),
    creditableInputVat: num(raw.creditable_input_vat),
    ewt: num(raw.ewt),
  }));

  const allowableDeductions = round(expenses.net - expenses.atRisk + depreciationTotal);
  const tax: FinanceStatement["tax"] = {
    business: businessTax({
      grossReceipts: receipts.netReceipts + cwtWithheld,
      outputVat: receipts.outputVat,
      creditableInputVat: expenses.creditableInputVat,
      settings,
    }),
    elections: compareElections({
      grossReceipts: receipts.incomeTaxBase,
      deductions: allowableDeductions,
      settings,
    }),
    allowableDeductions,
    cwt: {
      withheld: cwtWithheld,
      received: num(w.cwt_received),
      pending: num(w.cwt_pending),
      incomePayments: num(w.cwt_income_payments),
    },
    ewt: { withheld: num(w.ewt_withheld), unremitted: num(w.ewt_unremitted) },
    forms: incomeTaxForms(settings.entityType),
  };

  const groups = new Map<ExceptionKind, ExceptionGroup>();
  const exceptionRows = payload.exceptions.map(parseException);
  for (const row of exceptionRows) {
    const group = groups.get(row.kind) ?? {
      kind: row.kind,
      severity: row.severity,
      ...EXCEPTION_COPY[row.kind],
      rows: [],
      total: 0,
    };
    group.rows.push(row);
    group.total = round(group.total + (row.amount ?? 0));
    groups.set(row.kind, group);
  }

  return {
    receipts,
    expenses,
    depreciation: { rows: depreciationRows, total: depreciationTotal },
    incomeStatement,
    vehicles,
    monthly,
    tax,
    exceptions: {
      groups: [...groups.values()],
      count: exceptionRows.length,
      highCount: exceptionRows.filter((row) => row.severity === "high").length,
    },
  };
}
