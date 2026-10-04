import {
  describeDue,
  nextDueParts,
  type ScheduledPlan,
} from "@/features/maintenance/lib/maintenance-schedule";
import { formatDateKey } from "@/features/shared/lib/manila-time";
import { cn } from "@/lib/utils";

/** "40,150 km or Jul 10, 2026" over "Due in 850 km or 40 days", toned by status. */
export function NextDueCell({
  plan,
}: {
  plan: Pick<ScheduledPlan, "nextDueKm" | "nextDueOn" | "daysLeft" | "kmLeft" | "status">;
}) {
  return (
    <>
      {nextDueParts(plan, (key) => formatDateKey(key)) || "—"}
      <span
        className={cn(
          "block text-xs",
          plan.status === "overdue"
            ? "text-destructive"
            : plan.status === "due_soon"
              ? "text-warning"
              : "text-muted-foreground",
        )}
      >
        {describeDue(plan)}
      </span>
    </>
  );
}
