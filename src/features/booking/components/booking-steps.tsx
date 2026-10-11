import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export const BOOKING_STEPS = [
  { id: "trip", label: "Trip" },
  { id: "you", label: "Your details" },
  { id: "review", label: "Review" },
] as const;

export type BookingStepId = (typeof BOOKING_STEPS)[number]["id"];

/**
 * Where the renter is in the booking: three bars with their names. Steps
 * already passed are buttons back to them; later ones are not reachable
 * until the current step checks out.
 */
export function BookingSteps({
  current,
  onSelect,
  disabled,
}: {
  current: BookingStepId;
  onSelect: (step: BookingStepId) => void;
  disabled?: boolean;
}) {
  const currentIndex = BOOKING_STEPS.findIndex((step) => step.id === current);

  return (
    <nav aria-label="Booking steps">
      <ol className="grid grid-cols-3 gap-2">
        {BOOKING_STEPS.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          const content = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  "block h-1 rounded-full transition-colors duration-300",
                  active || done ? "bg-teal-600" : "bg-border",
                  done && "bg-teal-600/45",
                )}
              />
              <span
                className={cn(
                  "mt-2 flex items-center gap-1 text-xs sm:text-sm",
                  active
                    ? "font-semibold text-brand-950"
                    : "text-muted-foreground",
                )}
              >
                {done ? (
                  <Check aria-hidden="true" className="size-3.5 text-teal-700" />
                ) : (
                  <span className="tabular-nums">{index + 1}.</span>
                )}
                {step.label}
              </span>
            </>
          );
          return (
            <li key={step.id}>
              {done ? (
                <button
                  className="block w-full rounded-sm pb-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  disabled={disabled}
                  onClick={() => onSelect(step.id)}
                  type="button"
                >
                  {content}
                  <span className="sr-only"> (completed, go back)</span>
                </button>
              ) : (
                <div aria-current={active ? "step" : undefined} className="pb-1">
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
