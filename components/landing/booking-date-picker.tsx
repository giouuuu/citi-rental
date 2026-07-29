"use client";

import { useState } from "react";
import { format, parse, startOfDay } from "date-fns";
import { CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type BookingDatePickerProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  minDate?: string;
};

function parseLocalDate(value: string): Date | undefined {
  if (!value) return undefined;
  const parsed = parse(value, "yyyy-MM-dd", new Date());
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function toDateValue(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function BookingDatePicker({
  id,
  value,
  onChange,
  placeholder = "Pick a date",
  disabled,
  "aria-invalid": ariaInvalid,
  minDate,
}: BookingDatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = parseLocalDate(value);
  const earliest = minDate ? parseLocalDate(minDate) : undefined;
  const earliestDay = earliest ? startOfDay(earliest) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-invalid={ariaInvalid}
          className={cn(
            "h-12 w-full justify-start gap-2 px-3.5 text-left font-normal shadow-xs",
            !selected && "text-muted-foreground",
          )}
          disabled={disabled}
          id={id}
          type="button"
          variant="outline"
        >
          <CalendarDays aria-hidden="true" className="size-4 text-teal-600" />
          {selected ? format(selected, "MMM d, yyyy") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          disabled={earliestDay ? { before: earliestDay } : undefined}
          mode="single"
          onSelect={(date) => {
            if (!date) return;
            onChange(toDateValue(date));
            setOpen(false);
          }}
          selected={selected}
        />
      </PopoverContent>
    </Popover>
  );
}
