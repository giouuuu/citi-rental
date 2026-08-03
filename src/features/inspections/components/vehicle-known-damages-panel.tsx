"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { resolveVehicleKnownDamageAction } from "@/features/inspections/actions/actions";
import { statusLabel } from "@/features/inspections/lib/checklist-areas";
import type { VehicleKnownDamage } from "@/features/inspections/types/inspection";

export function VehicleKnownDamagesPanel({
  damages,
}: {
  damages: VehicleKnownDamage[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (damages.length === 0) {
    return (
      <Empty className="border border-dashed py-8">
        <EmptyHeader>
          <EmptyTitle>No open prior damage</EmptyTitle>
          <EmptyDescription>
            Issues noted at pickup/return inspections appear here until resolved.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ul className="space-y-3">
      {damages.map((damage) => (
        <li
          key={damage.id}
          className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border p-3"
        >
          <div>
            <p className="font-medium">
              {damage.label} · {statusLabel(damage.status)}
            </p>
            {damage.notes ? (
              <p className="mt-1 text-sm text-muted-foreground">{damage.notes}</p>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">
              Noted {new Date(damage.createdAt).toLocaleDateString("en-PH")}
            </p>
          </div>
          {!damage.isResolved ? (
            <Button
              disabled={pending}
              size="sm"
              type="button"
              variant="outline"
              onClick={() => {
                const data = new FormData();
                data.set("id", damage.id);
                startTransition(async () => {
                  await resolveVehicleKnownDamageAction(data);
                  router.refresh();
                });
              }}
            >
              {pending ? <LoaderCircle className="animate-spin" /> : <CheckCircle2 />}
              Mark resolved
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
