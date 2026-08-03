"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarCheck2,
  ClipboardCheck,
  LoaderCircle,
  XCircle,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { transitionRentalAction } from "@/features/rentals/actions/actions";
import {
  canTransitionRental,
  type RentalTransitionTarget,
  type RentalWorkflowStatus,
} from "@/features/rentals/lib/booking-gates";
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";
import { RentalInspectionSheet } from "@/features/inspections/components/rental-inspection-sheet";
import type {
  InspectionChecklist,
  RentalInspection,
  VehicleKnownDamage,
} from "@/features/inspections/types/inspection";

const ACTIONS: {
  status: RentalTransitionTarget;
  label: string;
  variant: "outline" | "destructive";
  icon: "reserve" | "cancel";
}[] = [
  { status: "reserved", label: "Reserve", variant: "outline", icon: "reserve" },
  {
    status: "cancelled",
    label: "Cancel",
    variant: "destructive",
    icon: "cancel",
  },
];

function ActionIcon({
  icon,
  pending,
}: {
  icon: (typeof ACTIONS)[number]["icon"];
  pending: boolean;
}) {
  if (pending) return <LoaderCircle className="animate-spin" />;
  if (icon === "reserve") return <CalendarCheck2 />;
  return <XCircle />;
}

export function RentalWorkflowActions({
  id,
  status,
  checklist = null,
  knownDamages = [],
  inspections = [],
  startingOdometer = null,
}: {
  id: string;
  status: RentalWorkflowStatus;
  checklist?: InspectionChecklist | null;
  knownDamages?: VehicleKnownDamage[];
  inspections?: RentalInspection[];
  startingOdometer?: number | null;
}) {
  const [error, setError] = useState("");
  const { isPending, runMutation } = useMutationCoordinator();
  const router = useRouter();

  const hasPickup = inspections.some((row) => row.inspectionType === "pickup");
  const hasReturn = inspections.some((row) => row.inspectionType === "return");
  const pickup = inspections.find((row) => row.inspectionType === "pickup");

  function transition(next: RentalTransitionTarget) {
    if (!canTransitionRental(status, next)) return;
    if (
      next !== "reserved" &&
      !window.confirm(
        "Cancel this rental? This action keeps the record for history.",
      )
    ) {
      return;
    }

    const data = new FormData();
    data.set("id", id);
    data.set("status", next);

    runMutation(async () => {
      const result = await transitionRentalAction(data);
      if (result.success) {
        setError("");
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  const canStart = canTransitionRental(status, "active") && !hasPickup;
  const canComplete = canTransitionRental(status, "completed") && !hasReturn;
  const visible = ACTIONS.filter((action) =>
    canTransitionRental(status, action.status),
  );

  if (visible.length === 0 && !canStart && !canComplete) {
    return (
      <p className="text-sm text-muted-foreground">
        No booking actions available for a {status} rental.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error ? (
        <Alert className="basis-full py-2" variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {canStart ? (
        <RentalInspectionSheet
          checklist={checklist}
          inspectionType="pickup"
          knownDamages={knownDamages}
          rentalId={id}
          startingOdometer={startingOdometer}
          triggerLabel="Start with inspection"
        />
      ) : null}

      {canComplete ? (
        <RentalInspectionSheet
          checklist={checklist}
          inspectionType="return"
          knownDamages={knownDamages}
          referenceInspection={pickup ?? null}
          rentalId={id}
          startingOdometer={startingOdometer}
          triggerLabel="Complete with inspection"
        />
      ) : null}

      {visible.map((action) => (
        <Button
          key={action.status}
          disabled={isPending}
          type="button"
          variant={action.variant}
          onClick={() => transition(action.status)}
        >
          <ActionIcon icon={action.icon} pending={isPending} />
          {action.label}
        </Button>
      ))}

      {hasPickup || hasReturn ? (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <ClipboardCheck className="size-3.5" />
          {hasPickup && hasReturn
            ? "Pickup & return inspected"
            : hasPickup
              ? "Pickup inspected — use Complete with inspection to finish"
              : "Return inspected"}
        </span>
      ) : null}
    </div>
  );
}
