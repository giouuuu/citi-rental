import Link from "next/link";
import { Plus, ReceiptText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExportRowsButton } from "@/features/shared/components/export-rows-button";
import {
  formatDateKey,
  manilaDateKey,
  parseDateKey,
} from "@/features/shared/lib/manila-time";
import { formatPhp } from "@/features/vehicles/lib/rental-pricing";
import { expenseCategoryLabel } from "@/features/vehicle-costs/lib/expense-categories";
import type { VehicleExpense } from "@/features/vehicle-costs/services/list-vehicle-expenses";

function formatDate(value: string) {
  const key = parseDateKey(value);
  return key ? formatDateKey(key) : value;
}

function isSameMonth(value: string, now: Date) {
  return value.slice(0, 7) === manilaDateKey(now).slice(0, 7);
}

export function VehicleCostsPanel({
  expenses,
}: {
  expenses: VehicleExpense[];
}) {
  const now = new Date();
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const monthTotal = expenses
    .filter((expense) => isSameMonth(expense.incurredOn, now))
    .reduce((sum, expense) => sum + expense.amount, 0);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between border-b">
        <CardTitle>Expenses</CardTitle>
        <div className="flex flex-wrap justify-end gap-2">
          <ExportRowsButton
            fileName="vehicle-expenses"
            sheets={[
              {
                name: "Expenses",
                columns: [
                  { key: "incurredOn", header: "Date", format: "date" },
                  { key: "category", header: "Category" },
                  { key: "amount", header: "Amount", format: "money" },
                  { key: "vendor", header: "Vendor" },
                ],
                rows: expenses.map((expense) => ({
                  incurredOn: expense.incurredOn,
                  category: expenseCategoryLabel(expense.category),
                  amount: expense.amount,
                  vendor: expense.vendor,
                })),
              },
            ]}
          />
          <Button asChild size="sm">
            <Link href="/expenses/new">
              <Plus /> Record expense
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        <dl className="grid grid-cols-2 gap-4 sm:max-w-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              This month
            </dt>
            <dd className="text-lg font-semibold tabular-nums">
              {formatPhp(monthTotal)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Recorded total
            </dt>
            <dd className="text-lg font-semibold tabular-nums">
              {formatPhp(total)}
            </dd>
          </div>
        </dl>

        {expenses.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ReceiptText />
              </EmptyMedia>
              <EmptyTitle>No expenses recorded</EmptyTitle>
              <EmptyDescription>
                Repairs, washes, registration — record the first cost for this
                vehicle to start its ledger.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Receipt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="whitespace-nowrap">
                      <Link
                        className="hover:underline"
                        href={`/expenses/${expense.id}`}
                      >
                        {formatDate(expense.incurredOn)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {expenseCategoryLabel(expense.category)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPhp(expense.amount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {expense.vendor ?? "—"}
                    </TableCell>
                    <TableCell>
                      {expense.receiptUrl ? (
                        <a
                          className="text-sm underline underline-offset-2"
                          href={expense.receiptUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          View
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
