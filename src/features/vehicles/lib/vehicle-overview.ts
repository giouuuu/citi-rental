import { toMoney } from "@/features/shared/lib/money";

export type VehicleActivityKind = "rental" | "payment" | "expense" | "loan_payment";

export type VehicleActivity = {
  kind: VehicleActivityKind;
  occurredAt: string;
  recordType: "rental" | "expense" | "loan";
  recordId: string;
  label: string;
  detail: string | null;
  status: string | null;
  amount: number | null;
};

/**
 * One car's performance over a window (`vehicle_overview`). Cost figures are
 * null when the viewer is not the owner: admins see income and utilization only.
 */
export type VehicleOverview = {
  financeVisible: boolean;
  windowDays: number;
  rentalCount: number;
  rentedDays: number;
  /** Rented days over window days, 0-100. */
  utilizationPercent: number;
  collected: number;
  /** Cash received net of VAT, refunds subtracted. */
  income: number;
  expenses: number | null;
  profit: number | null;
  marginPercent: number | null;
  categories: { categoryId: string; name: string; amount: number; entries: number; share: number }[];
  monthly: { month: string; income: number; expenses: number | null; profit: number | null; rentedDays: number }[];
  activity: VehicleActivity[];
};

type Payload = {
  finance_visible?: boolean;
  summary?: Record<string, unknown>;
  categories?: Record<string, unknown>[] | null;
  monthly?: Record<string, unknown>[] | null;
  activity?: Record<string, unknown>[] | null;
};

const round = (value: number) => Math.round(value * 100) / 100;
const optionalMoney = (value: unknown) => (value === null || value === undefined ? null : toMoney(value));

export function parseVehicleOverview(payload: Payload): VehicleOverview {
  const summary = payload.summary ?? {};
  const financeVisible = Boolean(payload.finance_visible);
  const windowDays = Number(summary.window_days ?? 0);
  const rentedDays = Number(summary.rented_days ?? 0);
  const income = toMoney(summary.income);
  const expenses = financeVisible ? toMoney(summary.expenses) : null;
  const profit = expenses === null ? null : round(income - expenses);

  const categories = (payload.categories ?? []).map((row) => {
    const amount = toMoney(row.amount);
    return {
      categoryId: String(row.category_id),
      name: String(row.name ?? ""),
      amount,
      entries: Number(row.entries ?? 0),
      share: expenses && expenses > 0 ? Math.round((amount / expenses) * 1000) / 10 : 0,
    };
  });

  const monthly = (payload.monthly ?? []).map((row) => {
    const monthIncome = toMoney(row.income);
    const monthExpenses = financeVisible ? optionalMoney(row.expenses) ?? 0 : null;
    return {
      month: String(row.month),
      income: monthIncome,
      expenses: monthExpenses,
      profit: monthExpenses === null ? null : round(monthIncome - monthExpenses),
      rentedDays: Number(row.rented_days ?? 0),
    };
  });

  const activity = (payload.activity ?? []).map(
    (row): VehicleActivity => ({
      kind: row.kind as VehicleActivityKind,
      occurredAt: String(row.occurred_at),
      recordType: row.record_type as VehicleActivity["recordType"],
      recordId: String(row.record_id),
      label: String(row.label ?? ""),
      detail: row.detail ? String(row.detail) : null,
      status: row.status ? String(row.status) : null,
      amount: optionalMoney(row.amount),
    }),
  );

  return {
    financeVisible,
    windowDays,
    rentalCount: Number(summary.rental_count ?? 0),
    rentedDays,
    utilizationPercent: windowDays > 0 ? Math.min(100, Math.round((rentedDays / windowDays) * 1000) / 10) : 0,
    collected: toMoney(summary.collected),
    income,
    expenses,
    profit,
    marginPercent: profit === null || income <= 0 ? null : Math.round((profit / income) * 1000) / 10,
    categories,
    monthly,
    activity,
  };
}
