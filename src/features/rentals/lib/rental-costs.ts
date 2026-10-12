import type { RentalBill } from "@/features/rentals/lib/rental-bill";
import { BILL_ADJUSTMENT_CODE } from "@/features/rentals/types/rental-payment";

/**
 * What a rental cost the business: rows of the owner-only expense ledger
 * tagged to it (list_rental_costs). Internal; never on the renter's bill.
 */
export type RentalCost = {
  expenseId: string;
  /** The charge this is the cost of, when entered on a charge. */
  paymentId: string | null;
  /** The bill line this is the cost of: `pickup`, `return` or `fee:<charge type id>`. */
  line: string | null;
  description: string;
  category: string;
  amount: number;
  expenseDate: string;
};

export type RentalCosts = {
  costs: RentalCost[];
  /** Only the owner opens Finance; admins see costs here but not the ledger. */
  canOpenFinance: boolean;
};

/** Which bill line a cost is set on: a charge, or a line saved with the booking. */
export type CostTarget = { paymentId: string } | { line: string };

/** A line on the bill that can carry a cost. */
export type CostableLine = {
  /** Unique on the bill: the payment id, or the rental_line value. */
  key: string;
  name: string;
  amount: number;
  target: CostTarget;
};

/**
 * The bill lines a cost can be set on: delivery legs with a fee, booking fees
 * that name their charge type, and charges other than bill adjustments.
 */
export function costableLines(bill: Pick<RentalBill, "handover" | "bookingFees" | "charges">): CostableLine[] {
  return [
    ...bill.handover
      .filter((line) => line.fee > 0)
      .map((line) => ({ key: line.leg, name: line.label, amount: line.fee, target: { line: line.leg } })),
    ...bill.bookingFees.flatMap((fee) => {
      if (!fee.chargeTypeId) return [];
      const line = `fee:${fee.chargeTypeId}`;
      return [{ key: line, name: fee.name, amount: fee.amount, target: { line } }];
    }),
    ...bill.charges
      .filter((charge) => charge.chargeTypeCode !== BILL_ADJUSTMENT_CODE && charge.amount > 0)
      .map((charge) => ({
        key: charge.id,
        name: charge.chargeTypeName ?? "Charge",
        amount: charge.amount,
        target: { paymentId: charge.id },
      })),
  ];
}

/** The cost recorded on one bill line, if any. */
export function costFor(costs: RentalCost[], key: string): RentalCost | undefined {
  return costs.find((cost) => cost.paymentId === key || cost.line === key);
}

export type RentalCostSummary = {
  /** Lines that carry a cost, as billed to the renter. */
  charged: number;
  /** What the business paid out for them. */
  costs: number;
  /** charged − costs; negative when a line cost more than it brought in. */
  kept: number;
  /** Costs tagged to the rental that match no line on the bill (entered in Finance). */
  other: RentalCost[];
  otherTotal: number;
};

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Bill lines set against what they cost, counting only lines with a cost, so
 * a ₱1,000 extension with no cost does not inflate "kept". Costs tagged to the
 * rental from Finance are listed apart. Null when the rental has no costs.
 */
export function summarizeRentalCosts(
  lines: CostableLine[],
  costs: RentalCost[],
): RentalCostSummary | null {
  if (costs.length === 0) return null;
  const matched = lines.flatMap((line) => {
    const cost = costFor(costs, line.key);
    return cost ? [{ line, cost }] : [];
  });
  const matchedIds = new Set(matched.map(({ cost }) => cost.expenseId));
  const other = costs.filter((cost) => !matchedIds.has(cost.expenseId));
  const charged = round(matched.reduce((sum, { line }) => sum + line.amount, 0));
  const paidOut = round(matched.reduce((sum, { cost }) => sum + cost.amount, 0));
  return {
    charged,
    costs: paidOut,
    kept: round(charged - paidOut),
    other,
    otherTotal: round(other.reduce((sum, cost) => sum + cost.amount, 0)),
  };
}

/** The list_rental_costs payload; anything malformed is dropped. */
export function parseRentalCosts(value: unknown): RentalCosts {
  if (!value || typeof value !== "object") return { costs: [], canOpenFinance: false };
  const { costs, can_open_finance } = value as Record<string, unknown>;
  const text = (input: unknown) => (typeof input === "string" && input ? input : null);
  return {
    canOpenFinance: can_open_finance === true,
    costs: (Array.isArray(costs) ? costs : []).flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const entry = row as Record<string, unknown>;
      const expenseId = text(entry.expense_id);
      const amount = Number(entry.amount);
      if (!expenseId || !Number.isFinite(amount)) return [];
      return [
        {
          expenseId,
          paymentId: text(entry.payment_id),
          line: text(entry.line),
          description: text(entry.description) ?? "Expense",
          category: text(entry.category) ?? "",
          amount,
          expenseDate: text(entry.expense_date) ?? "",
        },
      ];
    }),
  };
}
