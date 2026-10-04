import type { FinanceStatement } from "@/features/finance/lib/statement";

/**
 * The owner's question — "did I make money?" — answered in one subtraction:
 * income minus expenses. VAT is left out of both sides (it is the
 * government's money passing through), and car depreciation is shown
 * separately so the headline stays the plain subtraction.
 */
export type ProfitOverview = {
  income: number;
  expenses: number;
  profit: number;
  /** Profit as a share of income, or null with no income. */
  marginPercent: number | null;
  /** VAT collected on top of income, owed to BIR. */
  vatCollected: number;
  depreciation: number;
  profitAfterDepreciation: number;
  months: { month: string; income: number; expenses: number; profit: number }[];
  categories: { categoryId: string; name: string; amount: number; share: number }[];
  cars: { vehicleId: string; plateNumber: string; name: string; income: number; costs: number; profit: number }[];
  issues: number;
};

const round = (value: number) => Math.round(value * 100) / 100;

export function buildProfitOverview(statement: FinanceStatement): ProfitOverview {
  const income = statement.receipts.netOfVat;
  const expenses = statement.expenses.net;
  const profit = round(income - expenses);
  const depreciation = statement.depreciation.total;

  const categories = statement.expenses.lines
    .filter((line) => line.net !== 0)
    .map((line) => ({
      categoryId: line.categoryId,
      name: line.name,
      amount: line.net,
      share: expenses > 0 ? Math.round((line.net / expenses) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const months = statement.monthly.map((month) => {
    const monthIncome = round(month.netReceipts - month.outputVat);
    return {
      month: month.month,
      income: monthIncome,
      expenses: month.expensesNet,
      profit: round(monthIncome - month.expensesNet),
    };
  });

  const cars = statement.vehicles
    .map((car) => ({
      vehicleId: car.vehicleId,
      plateNumber: car.plateNumber,
      name: car.name,
      income: car.receipts,
      costs: car.expenses,
      profit: round(car.receipts - car.expenses),
    }))
    .sort((a, b) => b.profit - a.profit);

  return {
    income,
    expenses,
    profit,
    marginPercent: income > 0 ? Math.round((profit / income) * 1000) / 10 : null,
    vatCollected: statement.receipts.outputVat,
    depreciation,
    profitAfterDepreciation: round(profit - depreciation),
    months,
    categories,
    cars,
    issues: statement.exceptions.highCount,
  };
}
