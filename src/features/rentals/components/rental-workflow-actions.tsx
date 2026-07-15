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
import { useMutationCoordinator } from "@/features/shared/components/mutation-provider";

export function RentalWorkflowActions({ id }: { id: string }) {
  const [error, setError] = useState("");
  const { isPending, runMutation } = useMutationCoordinator();
  const router = useRouter();
  function transition(
    status: "reserved" | "active" | "completed" | "cancelled",
  ) {
    if (
      status !== "active" &&
      status !== "reserved" &&
      !window.confirm(
        status === "completed"
          ? "Complete this rental and release the vehicle?"
          : "Cancel this rental? This action keeps the record for history.",
      )
    ) {
      return;
    }
    const data = new FormData();
    data.set("id", id);
    data.set("status", status);
    if (status === "completed")
      data.set("actual_return_at", new Date().toISOString());
    runMutation(async () => {
      const result = await transitionRentalAction(data);
      if (result.success) {
        setError("");
        router.refresh();
      } else setError(result.message);
    });
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {error ? (
        <Alert className="basis-full py-2" variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button
        disabled={isPending}
        onClick={() => transition("reserved")}
        variant="outline"
      >
        <CalendarCheck2 /> Reserve
      </Button>
      <Button
        disabled={isPending}
        onClick={() => transition("active")}
        variant="outline"
      >
        {isPending ? <LoaderCircle className="animate-spin" /> : <Play />} Start
      </Button>
      <Button
        disabled={isPending}
        onClick={() => transition("completed")}
        variant="outline"
      >
        <CheckCircle2 /> Complete
      </Button>
      <Button
        disabled={isPending}
        onClick={() => transition("cancelled")}
        variant="destructive"
      >
        <XCircle /> Cancel
      </Button>
    </div>
  );
}
