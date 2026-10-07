import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MoneyCell, StatementLines } from "@/features/finance/components/statement-lines";
import { bookValueAt, depreciationSchedule } from "@/features/finance/lib/depreciation";
import { fixedAssetFromRow } from "@/features/finance/services/finance-service";
import { ExportRowsButton } from "@/features/shared/components/export-rows-button";
import { formatDateKey, manilaDateKey } from "@/features/shared/lib/manila-time";
import { toMoney } from "@/features/shared/lib/money";
import type { ResourceRow } from "@/features/shared/types/resource";

/** The derived figures on an expense: what the form does not let you type. */
export function ExpenseSummaryCard({ row }: { row: ResourceRow }) {
  const withholding = Boolean(row.withholding_required);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Computed</CardTitle>
        <CardDescription>
          Derived from the amounts above when saved. Filed under {String(row.category_name ?? "its BIR line")}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <StatementLines
          label="Computed expense figures"
          lines={[
            { label: "Amount paid (VAT included)", amount: toMoney(row.gross_amount) },
            { label: "Less: input VAT", amount: toMoney(row.input_vat), negative: true },
            { label: "Deductible amount (net of VAT)", amount: toMoney(row.net_amount), kind: "subtotal" },
            ...(withholding
              ? [
                  {
                    label: `EWT withheld at ${Number(row.ewt_percent ?? 0)}%`,
                    amount: toMoney(row.ewt_amount),
                    note: row.ewt_remitted ? "Remitted to BIR." : "Not yet remitted — the deduction is at risk until it is.",
                  },
                  {
                    label: "Paid to the supplier after withholding",
                    amount: toMoney(row.gross_amount) - toMoney(row.ewt_amount),
                  },
                ]
              : []),
          ]}
        />
      </CardContent>
    </Card>
  );
}

/** Month-by-month schedule for one register entry, computed on read. */
export function DepreciationScheduleCard({ row }: { row: ResourceRow }) {
  const asset = fixedAssetFromRow(row);
  const schedule = depreciationSchedule(asset);
  const today = manilaDateKey(new Date());
  const now = bookValueAt(asset, schedule, today);
  const years = new Map<string, { amount: number; accumulated: number; bookValue: number }>();
  for (const month of schedule) {
    const year = month.month.slice(0, 4);
    const entry = years.get(year) ?? { amount: 0, accumulated: 0, bookValue: 0 };
    entry.amount = Math.round((entry.amount + month.amount) * 100) / 100;
    entry.accumulated = month.accumulated;
    entry.bookValue = month.bookValue;
    years.set(year, entry);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>Depreciation schedule</CardTitle>
          <CardDescription>
            Starts in the month acquired{asset.disposedOn ? " and stops with the month disposed" : ""}.{" "}
            {asset.vehicleId ? (
              <Link className="underline underline-offset-4" href={`/vehicles/${asset.vehicleId}`}>
                Open the vehicle
              </Link>
            ) : null}
          </CardDescription>
        </div>
        <div className="shrink-0">
          <ExportRowsButton
            fileName="depreciation-schedule"
            sheets={[
              {
                name: "Depreciation by year",
                columns: [
                  { key: "year", header: "Year" },
                  { key: "amount", header: "Depreciation", format: "money" },
                  { key: "accumulated", header: "Accumulated", format: "money" },
                  { key: "bookValue", header: "Book value at year end", format: "money" },
                ],
                rows: [...years.entries()].map(([year, entry]) => ({ year, ...entry })),
              },
            ]}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <StatementLines
          label={`Book value as of ${formatDateKey(today)}`}
          lines={[
            { label: "Acquisition cost", amount: asset.acquisitionCost },
            { label: `Accumulated depreciation to ${formatDateKey(today)}`, amount: now.accumulated, negative: true },
            { label: "Net book value today", amount: now.bookValue, kind: "total" },
          ]}
        />
        <Table aria-label="Depreciation by calendar year">
          <TableHeader>
            <TableRow>
              <TableHead>Year</TableHead>
              <TableHead className="text-right">Depreciation</TableHead>
              <TableHead className="text-right">Accumulated</TableHead>
              <TableHead className="text-right">Book value at year end</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...years.entries()].map(([year, entry]) => (
              <TableRow key={year}>
                <TableCell>{year}</TableCell>
                <MoneyCell value={entry.amount} />
                <MoneyCell value={entry.accumulated} />
                <MoneyCell value={entry.bookValue} />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
