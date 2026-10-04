import { addMonthsToKey } from "@/features/finance/lib/finance-period";
import { addDaysToKey } from "@/features/shared/lib/manila-time";

export type LoanInterestMethod = "effective" | "straight_line";
export type LoanStatus = "active" | "paid_off" | "closed";

/** A car loan as the bank's disclosure states it (`vehicle_loans`). */
export type VehicleLoan = {
  id: string;
  vehicleId: string;
  lenderName: string;
  accountNumber: string | null;
  amountFinanced: number;
  monthlyAmortization: number;
  termMonths: number;
  firstDueDate: string;
  installmentsPaidBefore: number;
  interestMethod: LoanInterestMethod;
  status: LoanStatus;
  notes: string | null;
};

export type LoanPayment = {
  id: string;
  loanId: string;
  installmentNumber: number;
  paidOn: string;
  principal: number;
  interest: number;
  amountPaid: number;
  paymentMethod: string | null;
  referenceNumber: string | null;
  status: "recorded" | "void";
};

export type Installment = {
  number: number;
  dueDate: string;
  payment: number;
  principal: number;
  interest: number;
  /** Principal still owed after this installment. */
  balanceAfter: number;
};

export type InstallmentState = "paid_before" | "paid" | "overdue" | "next" | "upcoming";

export type ScheduledInstallment = Installment & {
  state: InstallmentState;
  /** The recorded payment, for `paid` installments. */
  paymentRecord: LoanPayment | null;
};

export type LoanProgress = {
  schedule: ScheduledInstallment[];
  totalInterest: number;
  settledCount: number;
  remainingCount: number;
  principalPaid: number;
  interestPaid: number;
  balance: number;
  overdueCount: number;
  /** The first unsettled installment, overdue or not: the one to pay now. */
  nextDue: ScheduledInstallment | null;
  percentPaid: number;
};

const toCentavos = (pesos: number) => Math.round(pesos * 100);
const toPesos = (centavos: number) => Math.round(centavos) / 100;

/**
 * Due date of installment `index` (0-based): the first due date's day of the
 * month, clamped to the month's last day (Jan 31 -> Feb 28 -> Mar 31).
 */
export function installmentDueDate(firstDueDate: string, index: number): string {
  const day = Number(firstDueDate.slice(8, 10));
  const monthStart = addMonthsToKey(`${firstDueDate.slice(0, 7)}-01`, index);
  const lastDay = Number(addDaysToKey(addMonthsToKey(monthStart, 1), -1).slice(8, 10));
  return `${monthStart.slice(0, 8)}${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

/**
 * Monthly rate at which `term` equal payments repay `principal`: the rate a
 * bank's amortization implies, whatever add-on rate it advertised.
 */
export function impliedMonthlyRate(principal: number, payment: number, term: number): number {
  if (principal <= 0 || payment * term <= principal) return 0;
  const presentValue = (rate: number) => (payment * (1 - (1 + rate) ** -term)) / rate;
  let low = 0;
  let high = 1;
  for (let step = 0; step < 200; step += 1) {
    const mid = (low + high) / 2;
    if (presentValue(mid) > principal) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/**
 * Installment-by-installment split. Works in centavos; the last installment
 * absorbs rounding so principal sums to exactly the amount financed and
 * interest to exactly (amortization x term - amount financed).
 */
export function loanSchedule(
  loan: Pick<VehicleLoan, "amountFinanced" | "monthlyAmortization" | "termMonths" | "firstDueDate" | "interestMethod">,
): Installment[] {
  const term = loan.termMonths;
  const payment = toCentavos(loan.monthlyAmortization);
  const financed = toCentavos(loan.amountFinanced);
  const totalInterest = Math.max(0, payment * term - financed);
  const rate =
    loan.interestMethod === "effective"
      ? impliedMonthlyRate(loan.amountFinanced, loan.monthlyAmortization, term)
      : 0;

  const schedule: Installment[] = [];
  let balance = financed;
  let interestSoFar = 0;

  for (let number = 1; number <= term; number += 1) {
    let interest: number;
    let principal: number;
    if (number === term) {
      principal = balance;
      interest = totalInterest - interestSoFar;
    } else {
      interest =
        loan.interestMethod === "effective"
          ? Math.round(balance * rate)
          : Math.round((totalInterest * number) / term) - Math.round((totalInterest * (number - 1)) / term);
      interest = Math.min(Math.max(interest, 0), payment, totalInterest - interestSoFar);
      principal = Math.min(payment - interest, balance);
    }
    balance -= principal;
    interestSoFar += interest;
    schedule.push({
      number,
      dueDate: installmentDueDate(loan.firstDueDate, number - 1),
      payment: toPesos(principal + interest),
      principal: toPesos(principal),
      interest: toPesos(interest),
      balanceAfter: toPesos(balance),
    });
  }

  return schedule;
}

/**
 * Where the loan stands on `today` (a Manila date key): the schedule with each
 * installment's state, and the balance from what was actually paid.
 */
export function loanProgress(loan: VehicleLoan, payments: LoanPayment[], today: string): LoanProgress {
  const recorded = new Map(
    payments
      .filter((payment) => payment.status === "recorded" && payment.loanId === loan.id)
      .map((payment) => [payment.installmentNumber, payment]),
  );
  const closed = loan.status !== "active";

  let nextAssigned = false;
  let principalPaid = 0;
  let interestPaid = 0;
  let overdueCount = 0;
  let settledCount = 0;

  const schedule = loanSchedule(loan).map((installment): ScheduledInstallment => {
    const paymentRecord = recorded.get(installment.number) ?? null;
    let state: InstallmentState;
    if (installment.number <= loan.installmentsPaidBefore) {
      state = "paid_before";
      principalPaid += toCentavos(installment.principal);
      interestPaid += toCentavos(installment.interest);
    } else if (paymentRecord) {
      state = "paid";
      principalPaid += toCentavos(paymentRecord.principal);
      interestPaid += toCentavos(paymentRecord.interest);
    } else if (!closed && installment.dueDate < today) {
      state = "overdue";
      overdueCount += 1;
    } else if (!closed && !nextAssigned) {
      state = "next";
    } else {
      state = "upcoming";
    }
    if (state === "paid_before" || state === "paid") settledCount += 1;
    // "next" is the first installment not yet due, even behind overdue ones.
    if (state === "next") nextAssigned = true;
    return { ...installment, state, paymentRecord };
  });

  const financed = toCentavos(loan.amountFinanced);
  const balance = loan.status === "paid_off" ? 0 : Math.max(0, financed - principalPaid);

  return {
    schedule,
    totalInterest: toPesos(schedule.reduce((sum, row) => sum + toCentavos(row.interest), 0)),
    settledCount,
    remainingCount: loan.termMonths - settledCount,
    principalPaid: toPesos(principalPaid),
    interestPaid: toPesos(interestPaid),
    balance: toPesos(balance),
    overdueCount,
    nextDue: schedule.find((row) => row.state === "overdue" || row.state === "next") ?? null,
    percentPaid: financed > 0 ? Math.round(((financed - balance) / financed) * 1000) / 10 : 0,
  };
}
