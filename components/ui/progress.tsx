"use client"

import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  // Radix treats a null value as indeterminate: role="progressbar" with
  // data-state="indeterminate" and no aria-valuenow, which is the correct
  // semantic for a wait of unknown length.
  const isIndeterminate = value === null || value === undefined

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted",
        className
      )}
      value={value}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "bg-primary",
          isIndeterminate
            ? "h-full progress-indeterminate"
            : "size-full flex-1 transition-all"
        )}
        style={
          isIndeterminate
            ? undefined
            : { transform: `translateX(-${100 - (value || 0)}%)` }
        }
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
