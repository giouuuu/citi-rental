import Link from "next/link";
import type { ReactNode } from "react";
import { Wrench } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describeDue, type ScheduledPlan } from "@/features/maintenance/lib/maintenance-schedule";
import { cn } from "@/lib/utils";

export type DueItem = Pick<ScheduledPlan, "id" | "name" | "status" | "daysLeft" | "kmLeft"> & {
  /** Shown before the service name on fleet-wide lists. */
  vehicleLabel?: string;
  /** Opens the car's maintenance tab, on fleet-wide lists. */
  href?: string;
};

const VISIBLE = 5;

/**
 * Services that are due soon or overdue. Warns only: nothing is blocked, the
 * car can still be booked.
 */
export function MaintenanceDueAlert({
  items,
  action,
  children,
  className,
}: {
  items: DueItem[];
  action?: { label: string; href: string };
  /** Extra guidance under the list, e.g. what this means for a booking. */
  children?: ReactNode;
  className?: string;
}) {
  if (items.length === 0) return null;
  const overdue = items.filter((item) => item.status === "overdue").length;
  const hidden = items.length - VISIBLE;

  return (
    <Alert
      className={cn(!overdue && "border-warning/25 bg-warning-surface *:[svg]:text-warning", className)}
      variant={overdue ? "destructive" : "default"}
    >
      <Wrench />
      <AlertTitle>
        {overdue
          ? `${overdue} ${overdue === 1 ? "service is" : "services are"} overdue`
          : `${items.length} ${items.length === 1 ? "service is" : "services are"} due soon`}
        {overdue && items.length > overdue ? ` · ${items.length - overdue} due soon` : ""}
      </AlertTitle>
      <AlertDescription>
        <ul className="space-y-0.5">
          {items.slice(0, VISIBLE).map((item) => {
            const label = (
              <>
                {item.vehicleLabel ? <span className="font-medium">{item.vehicleLabel} · </span> : null}
                {item.name}
              </>
            );
            return (
              <li key={item.id}>
                {item.href ? (
                  <Link className="underline-offset-4 hover:underline" href={item.href}>
                    {label}
                  </Link>
                ) : (
                  label
                )}
                <span className="text-muted-foreground"> — {describeDue(item)}</span>
              </li>
            );
          })}
          {hidden > 0 ? <li className="text-muted-foreground">and {hidden} more</li> : null}
        </ul>
        {children}
        {action ? (
          <Button asChild className="mt-2" size="sm" variant="outline">
            <Link href={action.href} scroll={false}>
              {action.label}
            </Link>
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
