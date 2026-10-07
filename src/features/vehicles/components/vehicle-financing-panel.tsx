"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { HandCoins, Landmark, Pencil, Tag, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/design-system/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { voidLoanPaymentAction } from "@/features/finance/actions/vehicle-loan-actions";
import type { LoanProgress, ScheduledInstallment, VehicleLoan } from "@/features/finance/lib/loan-schedule";
import { LOAN_STATUS_LABELS } from "@/features/finance/schemas/vehicle-loan-definition";
import { ConfirmActionDialog } from "@/features/shared/components/confirm-action-dialog";
import { ExportRowsButton } from "@/features/shared/components/export-rows-button";
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";
import { formatDateKey, formatPhp, formatPhpExact } from "@/features/shared/client";
import { useVehicleActions } from "@/features/vehicles/components/vehicle-actions-provider";
import { cn } from "@/lib/utils";

export type VehicleLoanView = { loan: VehicleLoan; progress: LoanProgress };

export type VehicleAssetView = {
  id: string;
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLifeMonths: number;
  methodLabel: string;
  accumulated: number;
  bookValue: number;
};

const INSTALLMENT_LABELS: Record<ScheduledInstallment["state"], string> = {
  paid_before: "Paid earlier",
  paid: "Paid",
  overdue: "Overdue",
  next: "Next due",
  upcoming: "Upcoming",
};

const INSTALLMENT_TONES: Record<ScheduledInstallment["state"], string> = {
  paid_before: "completed",
  paid: "recorded",
  overdue: "overdue",
  next: "pending",
  upcoming: "draft",
};

/** The loan as a form row, for the edit dialog. */
function loanRow(loan: VehicleLoan) {
  return {
    id: loan.id,
    vehicle_id: loan.vehicleId,
    lender_name: loan.lenderName,
    account_number: loan.accountNumber,
    amount_financed: loan.amountFinanced,
    monthly_amortization: loan.monthlyAmortization,
    term_months: loan.termMonths,
    first_due_date: loan.firstDueDate,
    installments_paid_before: loan.installmentsPaidBefore,
    interest_method: loan.interestMethod,
    status: loan.status,
    notes: loan.notes,
  };
}

/** Owner-only: the car's loan schedule and its purchase cost. */
export function VehicleFinancingPanel({
  loans,
  asset,
}: {
  loans: VehicleLoanView[];
  asset: VehicleAssetView | null;
}) {
  const { editLoan, addPurchaseCost } = useVehicleActions();
  const active = loans.find((entry) => entry.loan.status === "active") ?? null;
  const history = loans.filter((entry) => entry !== active);

  return (
    <div className="space-y-6">
      {active ? (
        <LoanCard entry={active} />
      ) : (
        <Card>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Landmark />
                </EmptyMedia>
                <EmptyTitle>No active car loan</EmptyTitle>
                <EmptyDescription>
                  If this car is financed, enter the bank&apos;s terms once. Each month you tick off the installment,
                  and its interest is booked as this car&apos;s expense.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => editLoan()}>
                  <Landmark /> Set up car loan
                </Button>
              </EmptyContent>
            </Empty>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Purchase cost</CardTitle>
          <CardDescription>
            What the car cost you. It loses value every month (depreciation), which counts against its profit as a tax
            deduction even though no cash goes out.
          </CardDescription>
          {asset ? (
            <CardAction>
              <Button asChild size="sm" variant="outline">
                <Link href={`/finance/assets/${asset.id}`}>
                  <Pencil /> Edit
                </Link>
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent>
          {asset ? (
            <dl className="grid gap-4 text-sm sm:grid-cols-4">
              <Stat label="Purchase cost" value={formatPhp(asset.acquisitionCost)} />
              <Stat label="Bought on" value={formatDateKey(asset.acquisitionDate)} />
              <Stat label="Value lost so far" value={formatPhp(asset.accumulated)} />
              <Stat
                label="Value on the books today"
                note={`${asset.methodLabel}, ${Math.round(asset.usefulLifeMonths / 12)} years`}
                value={formatPhp(asset.bookValue)}
              />
            </dl>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                No purchase cost recorded yet, so this car&apos;s biggest deduction is missing from the books.
              </p>
              <Button onClick={addPurchaseCost} variant="outline">
                <Tag /> Add purchase cost
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {history.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Earlier loans</CardTitle>
            <CardAction>
              <ExportRowsButton
                fileName="earlier-loans"
                sheets={[
                  {
                    name: "Earlier loans",
                    columns: [
                      { key: "lender", header: "Lender" },
                      { key: "financed", header: "Financed", format: "money" },
                      { key: "paid", header: "Installments paid", format: "number" },
                      { key: "term", header: "Term (months)", format: "number" },
                      { key: "status", header: "Status" },
                    ],
                    rows: history.map(({ loan, progress }) => ({
                      lender: loan.lenderName,
                      financed: loan.amountFinanced,
                      paid: progress.settledCount,
                      term: loan.termMonths,
                      status: LOAN_STATUS_LABELS[loan.status],
                    })),
                  },
                ]}
              />
            </CardAction>
          </CardHeader>
          <CardContent>
            <Table aria-label="Earlier loans">
              <TableHeader>
                <TableRow>
                  <TableHead>Lender</TableHead>
                  <TableHead className="text-right">Financed</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map(({ loan, progress }) => (
                  <TableRow key={loan.id}>
                    <TableCell>{loan.lenderName}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPhp(loan.amountFinanced)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {progress.settledCount} of {loan.termMonths}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={LOAN_STATUS_LABELS[loan.status]}
                        status={loan.status === "paid_off" ? "completed" : "inactive"}
                      />
                    </TableCell>
                    <TableCell>
                      <Button onClick={() => editLoan(loanRow(loan))} size="sm" variant="ghost">
                        <Pencil /> Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function LoanCard({ entry: { loan, progress } }: { entry: VehicleLoanView }) {
  const { editLoan, recordLoanPayment } = useVehicleActions();
  const router = useRouter();
  const { runMutation } = useMutationCoordinator();
  const [voidError, setVoidError] = useState<string | undefined>();
  const next = progress.nextDue;

  const pay = (installment: ScheduledInstallment) =>
    recordLoanPayment({
      loanId: loan.id,
      lenderName: loan.lenderName,
      termMonths: loan.termMonths,
      installment,
    });

  function voidPayment(paymentId: string) {
    runMutation(async () => {
      const result = await voidLoanPaymentAction(paymentId);
      if (!result.success) {
        setVoidError(result.message);
        return;
      }
      setVoidError(undefined);
      toast.success("Payment voided, and its interest expense with it.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{loan.lenderName}</CardTitle>
        <CardDescription>
          {formatPhpExact(loan.monthlyAmortization)} a month for {loan.termMonths} months
          {loan.accountNumber ? ` · Account ${loan.accountNumber}` : ""}
        </CardDescription>
        <CardAction className="flex flex-wrap gap-2">
          <ExportRowsButton
            fileName={`loan-schedule-${loan.lenderName
              .toLowerCase()
              .replaceAll(/[^a-z0-9]+/g, "-")
              .replaceAll(/^-+|-+$/g, "")}`}
            sheets={[
              {
                name: "Installment schedule",
                columns: [
                  { key: "number", header: "#", format: "number" },
                  { key: "dueDate", header: "Due", format: "date" },
                  { key: "paidOn", header: "Paid on", format: "date" },
                  { key: "reference", header: "Reference" },
                  { key: "payment", header: "Payment", format: "money" },
                  { key: "interest", header: "Interest", format: "money" },
                  { key: "principal", header: "Principal", format: "money" },
                  { key: "balanceAfter", header: "Balance after", format: "money" },
                  { key: "status", header: "Status" },
                ],
                rows: progress.schedule.map((row) => {
                  const paid = row.paymentRecord;
                  return {
                    number: row.number,
                    dueDate: row.dueDate,
                    paidOn: paid?.paidOn,
                    reference: paid?.referenceNumber,
                    payment: paid ? paid.amountPaid : row.payment,
                    interest: paid ? paid.interest : row.interest,
                    principal: paid ? paid.principal : row.principal,
                    balanceAfter: row.balanceAfter,
                    status: INSTALLMENT_LABELS[row.state],
                  };
                }),
              },
            ]}
          />
          <Button onClick={() => editLoan(loanRow(loan))} size="sm" variant="outline">
            <Pencil /> Edit loan
          </Button>
          {next ? (
            <Button onClick={() => pay(next)} size="sm">
              <HandCoins /> Record payment
            </Button>
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-6">
        <dl className="grid gap-4 text-sm sm:grid-cols-4">
          <Stat label="Still owed" note="Principal only" value={formatPhp(progress.balance)} />
          <Stat
            label="Installments paid"
            note={`${progress.remainingCount} to go`}
            value={`${progress.settledCount} of ${loan.termMonths}`}
          />
          <Stat
            label="Next due"
            note={next ? formatPhpExact(next.payment) : undefined}
            tone={progress.overdueCount > 0 ? "bad" : undefined}
            value={next ? formatDateKey(next.dueDate) : "Nothing due"}
          />
          <Stat
            label="Interest paid so far"
            note={`of ${formatPhp(progress.totalInterest)} over the loan`}
            value={formatPhp(progress.interestPaid)}
          />
        </dl>
        <div className="space-y-1.5">
          <Progress aria-label="Share of the amount financed repaid" value={progress.percentPaid} />
          <p className="text-xs text-muted-foreground">
            {progress.percentPaid}% of {formatPhp(loan.amountFinanced)} repaid
            {progress.overdueCount > 0
              ? ` · ${progress.overdueCount} ${progress.overdueCount === 1 ? "installment is" : "installments are"} overdue`
              : ""}
          </p>
        </div>
        {voidError ? (
          <p className="text-sm text-destructive" role="alert">
            {voidError}
          </p>
        ) : null}
        <div className="max-h-[32rem] overflow-y-auto rounded-lg border">
          <Table aria-label="Installment schedule">
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Payment</TableHead>
                <TableHead className="text-right">Interest</TableHead>
                <TableHead className="text-right">Principal</TableHead>
                <TableHead className="text-right">Balance after</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {progress.schedule.map((row) => {
                const paid = row.paymentRecord;
                return (
                  <TableRow className={cn(row.state === "next" && "bg-muted/50")} key={row.number}>
                    <TableCell className="tabular-nums">{row.number}</TableCell>
                    <TableCell>
                      {formatDateKey(row.dueDate)}
                      {paid ? (
                        <span className="block text-xs text-muted-foreground">
                          Paid {formatDateKey(paid.paidOn)}
                          {paid.referenceNumber ? ` · ${paid.referenceNumber}` : ""}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPhpExact(paid ? paid.amountPaid : row.payment)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPhpExact(paid ? paid.interest : row.interest)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPhpExact(paid ? paid.principal : row.principal)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {formatPhpExact(row.balanceAfter)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge label={INSTALLMENT_LABELS[row.state]} status={INSTALLMENT_TONES[row.state]} />
                    </TableCell>
                    <TableCell className="text-right">
                      {row.state === "overdue" || row.state === "next" || row.state === "upcoming" ? (
                        <Button onClick={() => pay(row)} size="sm" variant={row.state === "upcoming" ? "ghost" : "outline"}>
                          Record
                        </Button>
                      ) : paid ? (
                        <ConfirmActionDialog
                          confirmLabel="Void payment"
                          description={`Installment ${row.number} goes back to unpaid, and the ${formatPhpExact(paid.interest)} interest expense it posted is voided too.`}
                          error={voidError}
                          icon={Undo2}
                          onConfirm={() => voidPayment(paid.id)}
                          title="Void this payment?"
                          trigger={
                            <Button size="sm" variant="ghost">
                              Void
                            </Button>
                          }
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "bad";
}) {
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("text-lg font-semibold tabular-nums", tone === "bad" && "text-destructive")}>{value}</dd>
      {note ? <dd className="text-xs text-muted-foreground">{note}</dd> : null}
    </div>
  );
}
