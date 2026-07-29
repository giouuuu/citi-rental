"use client";

import { Check, Circle } from "lucide-react";

import { evaluatePasswordRequirements } from "@/features/auth/lib/password-requirements";
import { cn } from "@/lib/utils";

type PasswordRequirementsChecklistProps = {
  password: string;
  id?: string;
};

export function PasswordRequirementsChecklist({
  password,
  id = "password-requirements",
}: PasswordRequirementsChecklistProps) {
  const requirements = evaluatePasswordRequirements(password);
  const allMet = requirements.every((requirement) => requirement.met);
  const hasStarted = password.length > 0;

  return (
    <ul
      aria-label="Password requirements"
      className="space-y-1.5"
      id={id}
    >
      {requirements.map((requirement) => {
        const met = requirement.met;

        return (
          <li
            className={cn(
              "flex items-center gap-2 text-xs transition-colors duration-150 motion-reduce:transition-none",
              met ? "text-success" : "text-muted-foreground",
            )}
            key={requirement.id}
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-full",
                met ? "bg-success-surface" : "bg-transparent",
              )}
            >
              {met ? <Check className="size-3 stroke-[2.5]" /> : <Circle className="size-3" />}
            </span>
            <span>
              <span className="sr-only">{met ? "Met: " : "Not met: "}</span>
              {requirement.label}
            </span>
          </li>
        );
      })}
      <li aria-live="polite" className="sr-only">
        {hasStarted
          ? allMet
            ? "All password requirements met."
            : `Password requirements remaining: ${requirements
                .filter((requirement) => !requirement.met)
                .map((requirement) => requirement.label)
                .join(", ")}.`
          : "Enter a password that meets the requirements below."}
      </li>
    </ul>
  );
}
