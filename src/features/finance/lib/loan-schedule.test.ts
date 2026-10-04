import { describe, expect, it } from "vitest";

import {
  impliedMonthlyRate,
  installmentDueDate,
  loanProgress,
  loanSchedule,
  type LoanPayment,
  type VehicleLoan,
} from "@/features/finance/lib/loan-schedule";

const loan: VehicleLoan = {
  id: "loan-1",
  vehicleId: "car-1",
  lenderName: "BDO Auto Loans",
  accountNumber: null,
  amountFinanced: 600000,
  monthlyAmortization: 15000,
  termMonths: 48,
  firstDueDate: "2026-01-15",
  installmentsPaidBefore: 0,
  interestMethod: "effective",
  status: "active",
  notes: null,
};

const sum = (values: number[]) => Math.round(values.reduce((total, value) => total + value * 100, 0)) / 100;

function payment(installmentNumber: number, principal: number, interest: number): LoanPayment {
  return {
    id: `p${installmentNumber}`,
    loanId: loan.id,
    installmentNumber,
    paidOn: "2026-03-01",
    principal,
    interest,
    amountPaid: principal + interest,
    paymentMethod: "bank",
    referenceNumber: null,
    status: "recorded",
  };
}

describe("installmentDueDate", () => {
  it("keeps the day of the month and clamps short months", () => {
    expect(installmentDueDate("2026-01-31", 0)).toBe("2026-01-31");
    expect(installmentDueDate("2026-01-31", 1)).toBe("2026-02-28");
    expect(installmentDueDate("2026-01-31", 2)).toBe("2026-03-31");
    expect(installmentDueDate("2027-12-15", 2)).toBe("2028-02-15");
    expect(installmentDueDate("2028-01-30", 1)).toBe("2028-02-29");
  });
});

describe("impliedMonthlyRate", () => {
  it("is zero when there is no interest", () => {
    expect(impliedMonthlyRate(1200, 100, 12)).toBe(0);
  });

  it("recovers a known annuity rate", () => {
    // 100,000 at 1% a month over 12 months amortizes at 8,884.88.
    expect(impliedMonthlyRate(100000, 8884.88, 12)).toBeCloseTo(0.01, 5);
  });
});

describe("loanSchedule", () => {
  it.each(["effective", "straight_line"] as const)("%s: principal and interest sum exactly", (interestMethod) => {
    const schedule = loanSchedule({ ...loan, interestMethod });
    expect(schedule).toHaveLength(48);
    expect(sum(schedule.map((row) => row.principal))).toBe(600000);
    expect(sum(schedule.map((row) => row.interest))).toBe(15000 * 48 - 600000);
    expect(schedule.at(-1)?.balanceAfter).toBe(0);
    expect(schedule[1].dueDate).toBe("2026-02-15");
  });

  it("effective interest falls as the balance shrinks", () => {
    const schedule = loanSchedule(loan);
    expect(schedule[0].interest).toBeGreaterThan(schedule[47].interest);
    expect(schedule[0].payment).toBe(15000);
    expect(schedule[0].interest + schedule[0].principal).toBe(15000);
  });

  it("straight-line interest is even", () => {
    const schedule = loanSchedule({ ...loan, interestMethod: "straight_line" });
    expect(schedule[0].interest).toBe(2500);
    expect(schedule[0].principal).toBe(12500);
    expect(schedule[30].interest).toBe(2500);
  });

  it("a zero-interest loan is all principal", () => {
    const schedule = loanSchedule({ ...loan, amountFinanced: 720000 });
    expect(schedule.every((row) => row.interest === 0)).toBe(true);
    expect(schedule.at(-1)?.balanceAfter).toBe(0);
  });
});

describe("loanProgress", () => {
  it("counts installments paid before tracking and recorded payments", () => {
    const schedule = loanSchedule(loan);
    const progress = loanProgress(
      { ...loan, installmentsPaidBefore: 1 },
      [payment(2, schedule[1].principal, schedule[1].interest)],
      "2026-04-01",
    );
    expect(progress.settledCount).toBe(2);
    expect(progress.remainingCount).toBe(46);
    expect(progress.principalPaid).toBe(sum([schedule[0].principal, schedule[1].principal]));
    expect(progress.balance).toBe(schedule[1].balanceAfter);
    // Installment 3 (03-15) is past due on 04-01; 4 (04-15) is not yet.
    expect(progress.overdueCount).toBe(1);
    expect(progress.nextDue?.number).toBe(3);
    expect(progress.schedule[0].state).toBe("paid_before");
    expect(progress.schedule[1].state).toBe("paid");
    expect(progress.schedule[2].state).toBe("overdue");
    expect(progress.schedule[3].state).toBe("next");
    expect(progress.schedule[4].state).toBe("upcoming");
  });

  it("uses the split actually paid, and ignores voided payments", () => {
    const progress = loanProgress(
      loan,
      [payment(1, 10000, 5000), { ...payment(2, 10000, 5000), status: "void" }],
      "2026-01-01",
    );
    expect(progress.principalPaid).toBe(10000);
    expect(progress.interestPaid).toBe(5000);
    expect(progress.balance).toBe(590000);
    expect(progress.nextDue?.number).toBe(2);
    expect(progress.overdueCount).toBe(0);
  });

  it("a paid-off loan owes nothing and flags nothing", () => {
    const progress = loanProgress({ ...loan, status: "paid_off" }, [], "2030-01-01");
    expect(progress.balance).toBe(0);
    expect(progress.overdueCount).toBe(0);
    expect(progress.nextDue).toBeNull();
    expect(progress.percentPaid).toBe(100);
  });
});
