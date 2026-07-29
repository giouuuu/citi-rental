"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarCheck2,
  CheckCircle2,
  LoaderCircle,
  Play,
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

const ACTIONS: {
  status: RentalTransitionTarget;
  label: string;
  variant: "outline" | "destructive";
  icon: "reserve" | "start" | "complete" | "cancel";
}[] = [
  { status: "reserved", label: "Reserve", variant: "outline", icon: "reserve" },
  { status: "active", label: "Start", variant: "outline", icon: "start" },
  {
    status: "completed",
    label: "Complete",
    variant: "outline",
    icon: "complete",
  },
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
  if (pending && icon === "start") {
    return <LoaderCircle className="animate-spin" />;
  }
  if (icon === "reserve") return <CalendarCheck2 />;
  if (icon === "start") return <Play />;
  if (icon === "complete") return <CheckCircle2 />;
  return <XCircle />;
}

export function RentalWorkflowActions({
  id,
  status,
}: {
  id: string;
  status: RentalWorkflowStatus;
}) {
  const [error, setError] = useState("");
  const { isPending, runMutation } = useMutationCoordinator();
  const router = useRouter();

  function transition(next: RentalTransitionTarget) {
    if (!canTransitionRental(status, next)) return;
    if (
      next !== "active" &&
      next !== "reserved" &&
      !window.confirm(
        next === "completed"
          ? "Complete this rental and release the vehicle?"
          : "Cancel this rental? This action keeps the record for history.",
      )
    ) {
      return;
    }

    const data = new FormData();
    data.set("id", id);
    data.set("status", next);
    if (next === "completed") {
      data.set("actual_return_at", new Date().toISOString());
    }

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

  const visible = ACTIONS.filter((action) =>
    canTransitionRental(status, action.status),
  );

  if (visible.length === 0) {
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
      {visible.map((action) => (
        <Button
          disabled={isPending}
          key={action.status}
          onClick={() => transition(action.status)}
          variant={action.variant}
        >
          <ActionIcon icon={action.icon} pending={isPending} />
          {action.label}
        </Button>
      ))}
    </div>
  );
}
