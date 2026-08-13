"use client";

import { CheckIcon } from "lucide-react";

import type { InspectionFormStep } from "@/features/inspections/hooks/use-inspection-form-state";
import { cn } from "@/lib/utils";

export const INSPECTION_STEPS: {
  id: InspectionFormStep;
  label: string;
  hint: string;
}[] = [
  { id: "readings", label: "Readings", hint: "Odometer, fuel, cleanliness" },
  { id: "condition", label: "Condition", hint: "Panels and damage" },
  { id: "photos", label: "Photos", hint: "6 required angles" },
  { id: "signoff", label: "Sign-off", hint: "Signature and charges" },
];

export function InspectionStepNav({
  step,
  onSelect,
}: {
  step: InspectionFormStep;
  onSelect: (step: InspectionFormStep) => void;
}) {
  const activeIndex = INSPECTION_STEPS.findIndex((entry) => entry.id === step);

  return (
    <nav aria-label="Inspection steps">
      <ol className="flex items-center">
        {INSPECTION_STEPS.map((entry, index) => {
          const current = entry.id === step;
          const done = index < activeIndex;
          return (
            <li
              key={entry.id}
              className="flex min-w-0 items-center last:flex-none @2xl:flex-1"
            >
              <button
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full py-1 pr-2.5 pl-1 text-xs font-medium whitespace-nowrap transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  current
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
                type="button"
                onClick={() => onSelect(entry.id)}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                    current && "border-primary bg-primary text-primary-foreground",
                    done && !current && "border-primary/40 bg-primary/10 text-primary",
                    !current && !done && "border-border text-muted-foreground",
                  )}
                >
                  {done ? <CheckIcon className="size-3.5" /> : index + 1}
                </span>
                <span className={cn("truncate", !current && "hidden @lg:inline")}>
                  {entry.label}
                </span>
              </button>
              {index < INSPECTION_STEPS.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    "mx-1.5 h-px min-w-3 flex-1",
                    done ? "bg-primary/40" : "bg-border",
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
