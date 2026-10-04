"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarClock, CirclePause, Pencil, Plus, Undo2, Wrench } from "lucide-react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  archiveMaintenancePlanAction,
  voidMaintenanceAction,
} from "@/features/maintenance/actions/maintenance-actions";
import { MaintenancePlanDialog } from "@/features/maintenance/components/maintenance-plan-dialog";
import { NextDueCell } from "@/features/maintenance/components/next-due-cell";
import { RecordMaintenanceDialog } from "@/features/maintenance/components/record-maintenance-dialog";
import {
  describeInterval,
  formatKm,
  MAINTENANCE_STATE_LABELS,
  type MaintenancePlan,
  type MaintenanceRecord,
  type ScheduledPlan,
} from "@/features/maintenance/lib/maintenance-schedule";
import { ConfirmActionDialog } from "@/features/shared/components/confirm-action-dialog";
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";
import { formatDateKey, formatPhp, formatPhpExact } from "@/features/shared/client";
import { cn } from "@/lib/utils";

/**
 * The car's service schedule and history. The due warning itself sits above
 * the vehicle tabs (MaintenanceDueAlert), so it shows on every tab.
 */
export function VehicleMaintenancePanel({
  vehicleId,
  vehicleLabel,
  schedule,
  records,
  currentOdometer,
  today,
  canSeeExpenses,
}: {
  vehicleId: string;
  vehicleLabel: string;
  /** Active plans with their due status. */
  schedule: ScheduledPlan[];
  records: MaintenanceRecord[];
  currentOdometer: number | null;
  today: string;
  /** Owner: link through to the posted expenses. */
  canSeeExpenses: boolean;
}) {
  const router = useRouter();
  const { runMutation } = useMutationCoordinator();
  const [planDialog, setPlanDialog] = useState<{ plan: MaintenancePlan | null } | null>(null);
  const [recordDialog, setRecordDialog] = useState<{ planId: string | null } | null>(null);
  const [rowError, setRowError] = useState<string | undefined>();

  const recorded = records.filter((record) => record.status === "recorded");
  const totalSpent = recorded.reduce((sum, record) => sum + record.cost, 0);

  function stopPlan(plan: ScheduledPlan) {
    runMutation(async () => {
      const result = await archiveMaintenancePlanAction(plan.id);
      if (!result.success) {
        setRowError(result.message);
        return;
      }
      setRowError(undefined);
      toast.success(`${plan.name} removed from the schedule.`);
      router.refresh();
    });
  }

  function voidRecord(record: MaintenanceRecord) {
    runMutation(async () => {
      const result = await voidMaintenanceAction(record.id);
      if (!result.success) {
        setRowError(result.message);
        return;
      }
      setRowError(undefined);
      toast.success(record.postedExpense ? "Service voided, and its expense with it." : "Service voided.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {rowError ? (
        <p className="text-sm text-destructive" role="alert">
          {rowError}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Service schedule</CardTitle>
          <CardDescription>
            {currentOdometer !== null
              ? `Odometer ${formatKm(currentOdometer)}, updated at every pickup, return and service.`
              : "No odometer reading yet. Km-based plans start warning once one is recorded."}
          </CardDescription>
          {schedule.length > 0 ? (
            <CardAction className="flex flex-wrap gap-2">
              <Button onClick={() => setPlanDialog({ plan: null })} size="sm" variant="outline">
                <Plus /> Add plan
              </Button>
              <Button onClick={() => setRecordDialog({ planId: null })} size="sm">
                <Wrench /> Record service
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent>
          {schedule.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CalendarClock />
                </EmptyMedia>
                <EmptyTitle>No service schedule yet</EmptyTitle>
                <EmptyDescription>
                  Add the services this car needs, like an oil change every 10,000 km, aircon cleaning every 6
                  months, or PMS every year. You&apos;ll be warned before each one is due.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="flex-row flex-wrap justify-center">
                <Button onClick={() => setPlanDialog({ plan: null })}>
                  <Plus /> Add plan
                </Button>
                <Button onClick={() => setRecordDialog({ planId: null })} variant="outline">
                  <Wrench /> Record a one-off repair
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <Table aria-label="Service schedule">
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>Last done</TableHead>
                  <TableHead>Next due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedule.map((plan) => (
                  <TableRow className={cn(plan.status === "overdue" && "bg-danger-surface/40")} key={plan.id}>
                    <TableCell>
                      <span className="font-medium">{plan.name}</span>
                      <span className="block text-xs text-muted-foreground">{describeInterval(plan)}</span>
                    </TableCell>
                    <TableCell>
                      {formatDateKey(plan.lastDoneOn)}
                      <span className="block text-xs text-muted-foreground">
                        {[plan.lastOdometer !== null ? formatKm(plan.lastOdometer) : null, plan.fromRecord ? null : "starting point"]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <NextDueCell plan={plan} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge label={MAINTENANCE_STATE_LABELS[plan.status]} status={plan.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          onClick={() => setRecordDialog({ planId: plan.id })}
                          size="sm"
                          variant={plan.status === "on_schedule" ? "ghost" : "outline"}
                        >
                          Record
                        </Button>
                        <Button
                          aria-label={`Edit ${plan.name}`}
                          onClick={() => setPlanDialog({ plan })}
                          size="icon-sm"
                          variant="ghost"
                        >
                          <Pencil />
                        </Button>
                        <ConfirmActionDialog
                          confirmLabel="Stop schedule"
                          description={`${plan.name} stops warning for ${vehicleLabel}. Services already recorded stay in the history.`}
                          error={rowError}
                          icon={CirclePause}
                          onConfirm={() => stopPlan(plan)}
                          title={`Stop ${plan.name}?`}
                          trigger={
                            <Button aria-label={`Stop ${plan.name}`} size="icon-sm" variant="ghost">
                              <CirclePause />
                            </Button>
                          }
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Service history</CardTitle>
          <CardDescription>
            {recorded.length > 0
              ? `${recorded.length} ${recorded.length === 1 ? "service" : "services"}, ${formatPhp(totalSpent)} spent in total. Each cost is booked as this car's expense.`
              : "Every service you record lands here with what it cost."}
          </CardDescription>
          {canSeeExpenses && recorded.length > 0 ? (
            <CardAction>
              <Button asChild size="sm" variant="ghost">
                <Link href={`/finance/expenses?vehicle=${vehicleId}`}>All expenses for this car</Link>
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent>
          <Table aria-label="Service history">
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Service</TableHead>
                <TableHead className="text-right">Odometer</TableHead>
                <TableHead>Shop</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Empty className="py-6">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Wrench />
                        </EmptyMedia>
                        <EmptyTitle>No services recorded yet</EmptyTitle>
                        <EmptyDescription>
                          Record each oil change, cleaning or repair as it&apos;s done.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                records.map((record) => (
                  <TableRow className={cn(record.status === "void" && "text-muted-foreground")} key={record.id}>
                    <TableCell className="whitespace-nowrap">{formatDateKey(record.performedOn)}</TableCell>
                    <TableCell>
                      {record.title}
                      {record.notes ? (
                        <span className="block max-w-xs truncate text-xs text-muted-foreground">{record.notes}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {record.odometer !== null ? formatKm(record.odometer) : "—"}
                    </TableCell>
                    <TableCell>
                      {record.shopName ?? "—"}
                      {record.documentNumber ? (
                        <span className="block text-xs text-muted-foreground">{record.documentNumber}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums", record.status === "void" && "line-through")}>
                      {formatPhpExact(record.cost)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        label={record.status === "void" ? "Void" : "Recorded"}
                        status={record.status === "void" ? "void" : "recorded"}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      {record.status === "recorded" ? (
                        <ConfirmActionDialog
                          confirmLabel="Void service"
                          description={
                            record.postedExpense
                              ? `${record.title} on ${formatDateKey(record.performedOn)} is removed from the schedule, and its ${formatPhpExact(record.cost)} expense is voided too.`
                              : `${record.title} on ${formatDateKey(record.performedOn)} is removed from the schedule.`
                          }
                          error={rowError}
                          icon={Undo2}
                          onConfirm={() => voidRecord(record)}
                          title="Void this service?"
                          trigger={
                            <Button size="sm" variant="ghost">
                              Void
                            </Button>
                          }
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <MaintenancePlanDialog
        currentOdometer={currentOdometer}
        existingNames={schedule.map((plan) => plan.name)}
        onOpenChange={(open) => {
          if (!open) setPlanDialog(null);
        }}
        open={planDialog !== null}
        plan={planDialog?.plan ?? null}
        today={today}
        vehicleId={vehicleId}
      />
      <RecordMaintenanceDialog
        currentOdometer={currentOdometer}
        initialPlanId={recordDialog?.planId ?? (schedule.length === 1 ? schedule[0].id : null)}
        onOpenChange={(open) => {
          if (!open) setRecordDialog(null);
        }}
        open={recordDialog !== null}
        plans={schedule}
        today={today}
        vehicleId={vehicleId}
        vehicleLabel={vehicleLabel}
      />
    </div>
  );
}
