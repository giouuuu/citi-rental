"use client";

import { useCallback, useRef, useState } from "react";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input, inputSurfaceClassName } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  dateRangeDays,
  formatDateRange,
  matchDateRangePreset,
  type DateRangePreset,
  type DateRangeValue,
} from "@/features/shared/lib/date-range-presets";
import { formatDateKey } from "@/features/shared/lib/manila-time";
import { cn } from "@/lib/utils";

type Draft = { from: string | null; to: string | null };

export type DateRangeSelection = DateRangeValue & {
  /** The preset covering exactly these days, whether picked or typed. */
  preset: DateRangePreset | null;
};

const CUSTOM = "__custom";
/** Typed dates keep keyboard entry; the calendar beside them replaces the browser's own. */
const TYPED_DATE_CLASS =
  "[&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none";
/** Past this many presets the rail gets a search box. */
const SEARCHABLE_AT = 12;

/** Date keys are calendar days, so they map to local midnight for the grid. */
function keyToDate(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dateToKey(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function monthOf(key: string) {
  const date = keyToDate(key);
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function triggerLabel(
  draft: Draft,
  preset: DateRangePreset | null,
  placeholder: string,
) {
  if (preset) return preset.label;
  if (draft.from && draft.to) return formatDateRange({ from: draft.from, to: draft.to });
  if (draft.from) return `From ${formatDateKey(draft.from)}`;
  if (draft.to) return `Until ${formatDateKey(draft.to)}`;
  return placeholder;
}

/**
 * The one date range control: a preset rail (grouped, scrollable, searchable
 * when long) beside start/end inputs and a two-month range calendar.
 *
 * Picking a preset applies at once, like any discrete filter. Dates chosen on
 * the calendar or typed are a draft until Apply — a half-picked range is not
 * a filter. Callers own the URL: `onSelect` hands back the range plus the
 * preset it matches, so a page with period codes can keep its short links.
 */
export function DateRangePicker({
  value,
  presets,
  activePreset,
  onSelect,
  onClear,
  placeholder = "All dates",
  maxDays,
  minDate,
  maxDate,
  id,
  className,
  align = "start",
}: {
  value: Partial<DateRangeValue> | null;
  presets: readonly DateRangePreset[];
  /** The preset the URL names, when it carries a code rather than dates. */
  activePreset?: string | null;
  onSelect: (selection: DateRangeSelection) => void;
  /** Shows a Clear button; omit when the page always has a window. */
  onClear?: () => void;
  placeholder?: string;
  /** Longest range Apply accepts, mirroring a server-side cap. */
  maxDays?: number;
  minDate?: string;
  maxDate?: string;
  id?: string;
  className?: string;
  align?: "start" | "center" | "end";
}) {
  const isMobile = useIsMobile();
  const startRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const current: Draft = { from: value?.from ?? null, to: value?.to ?? null };
  const [draft, setDraft] = useState<Draft>(current);
  const [month, setMonth] = useState<Date>(() => new Date());
  // On open, bring the applied preset into view — "FY2025" can sit far down.
  const revealChecked = useCallback((list: HTMLDivElement | null) => {
    list?.querySelector('[data-checked="true"]')?.scrollIntoView({ block: "nearest" });
  }, []);

  const months = isMobile ? 1 : 2;
  const appliedPreset = matchDateRangePreset(presets, current, activePreset);
  const draftPreset = matchDateRangePreset(presets, draft);
  const complete = draft.from && draft.to ? { from: draft.from, to: draft.to } : null;
  const days = complete ? dateRangeDays(complete) : 0;
  const tooLong = Boolean(maxDays && days > maxDays);
  const unchanged = complete?.from === current.from && complete?.to === current.to;
  const groups = [...new Set(presets.map((preset) => preset.group))];

  /** The months to lead with when the popover opens on a range. */
  function show(next: Draft) {
    const anchor = next.from ?? next.to ?? maxDate ?? dateToKey(new Date());
    const first = monthOf(anchor);
    // With two months up and nothing selectable past the cap, lead with the
    // month before so the open month is not stranded beside a dead one.
    if (months === 2 && maxDate && anchor.slice(0, 7) === maxDate.slice(0, 7)) {
      first.setMonth(first.getMonth() - 1);
    }
    setMonth(first);
  }

  /** Scrolls the grid only when a typed date is off screen. */
  function reveal(key: string) {
    const target = monthOf(key);
    const last = new Date(month.getFullYear(), month.getMonth() + months - 1, 1);
    if (target < month) setMonth(target);
    else if (target > last) {
      setMonth(new Date(target.getFullYear(), target.getMonth() - (months - 1), 1));
    }
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      setDraft(current);
      show(current);
    }
    setOpen(next);
  }

  function commit(range: DateRangeValue) {
    onSelect({ ...range, preset: matchDateRangePreset(presets, range) });
    setOpen(false);
  }

  function pickPreset(preset: DateRangePreset) {
    onSelect({ from: preset.from, to: preset.to, preset });
    setOpen(false);
  }

  function setEnd(end: "from" | "to", key: string | null) {
    setDraft((previous) => {
      const next = { ...previous, [end]: key };
      // Keep the pair ordered: moving one end past the other drags it along.
      if (next.from && next.to && next.from > next.to) {
        if (end === "from") next.to = next.from;
        else next.from = next.to;
      }
      return next;
    });
    if (key) reveal(key);
  }

  function apply() {
    if (complete && !tooLong) commit(complete);
  }

  const selected = draft.from
    ? { from: keyToDate(draft.from), to: draft.to ? keyToDate(draft.to) : undefined }
    : undefined;
  const disabled = [
    ...(minDate ? [{ before: keyToDate(minDate) }] : []),
    ...(maxDate ? [{ after: keyToDate(maxDate) }] : []),
  ];

  return (
    <Popover onOpenChange={handleOpenChange} open={open}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            inputSurfaceClassName,
            "flex w-auto min-w-44 cursor-pointer items-center gap-2 text-left data-[state=open]:border-ring data-[state=open]:ring-2 data-[state=open]:ring-ring/30",
            !current.from && !current.to && "text-muted-foreground",
            className,
          )}
          id={id}
          type="button"
        >
          <CalendarIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{triggerLabel(current, appliedPreset, placeholder)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        aria-label="Choose dates"
        className="w-auto max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0"
        collisionPadding={16}
      >
        <div className="grid sm:grid-cols-[12rem_auto] sm:grid-rows-[1fr_auto]">
          {/* The rail is absolutely filled on wide screens so its length never
              stretches the popover; the calendar panel sets the height. */}
          <div className="relative flex border-b max-sm:max-h-48 sm:col-start-1 sm:row-start-1 sm:border-r sm:border-b-0">
            <Command
              className="rounded-none! bg-transparent sm:absolute sm:inset-0"
              defaultValue={appliedPreset?.value ?? (current.from || current.to ? CUSTOM : undefined)}
              loop
            >
              {presets.length > SEARCHABLE_AT ? (
                <CommandInput aria-label="Search presets" placeholder="Search…" />
              ) : null}
              <CommandList className="max-h-none flex-1" ref={revealChecked}>
                {groups.map((group) => (
                  <CommandGroup heading={group} key={group ?? "presets"}>
                    {presets
                      .filter((preset) => preset.group === group)
                      .map((preset) => (
                        <CommandItem
                          data-checked={draftPreset?.value === preset.value}
                          key={preset.value}
                          keywords={[preset.label, ...(group ? [group] : [])]}
                          onSelect={() => pickPreset(preset)}
                          value={preset.value}
                        >
                          {preset.label}
                        </CommandItem>
                      ))}
                  </CommandGroup>
                ))}
                <CommandGroup>
                  <CommandItem
                    data-checked={!draftPreset && Boolean(draft.from || draft.to)}
                    forceMount
                    onSelect={() => startRef.current?.focus()}
                    value={CUSTOM}
                  >
                    Custom range
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </div>

          <div className="space-y-4 p-4 sm:col-start-2 sm:row-span-2 sm:row-start-1">
            <div className="grid grid-cols-2 items-start gap-3">
              <Field>
                <FieldLabel htmlFor={`${id ?? "date-range"}-start`}>Start date</FieldLabel>
                <Input
                  id={`${id ?? "date-range"}-start`}
                  max={maxDate}
                  min={minDate}
                  onChange={(event) => setEnd("from", event.target.value || null)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") apply();
                  }}
                  ref={startRef}
                  className={TYPED_DATE_CLASS}
                  type="date"
                  value={draft.from ?? ""}
                />
              </Field>
              <Field data-invalid={tooLong || undefined}>
                <FieldLabel htmlFor={`${id ?? "date-range"}-end`}>End date</FieldLabel>
                <Input
                  aria-invalid={tooLong || undefined}
                  id={`${id ?? "date-range"}-end`}
                  max={maxDate}
                  min={draft.from ?? minDate}
                  onChange={(event) => setEnd("to", event.target.value || null)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") apply();
                  }}
                  className={TYPED_DATE_CLASS}
                  type="date"
                  value={draft.to ?? ""}
                />
                {tooLong ? (
                  <FieldError>Pick {maxDays} days or fewer.</FieldError>
                ) : null}
              </Field>
            </div>
            <Calendar
              className="p-0 [--cell-size:--spacing(9)]"
              disabled={disabled}
              mode="range"
              month={month}
              numberOfMonths={months}
              onMonthChange={setMonth}
              onSelect={(_, day) => {
                const key = dateToKey(day);
                // Click start, then end. A third click starts over, and a
                // click before the start moves the start instead of flipping.
                if (!draft.from || draft.to || key < draft.from) {
                  setDraft({ from: key, to: null });
                } else {
                  setDraft({ from: draft.from, to: key });
                }
              }}
              selected={selected}
            />
            <p aria-live="polite" className="text-xs text-muted-foreground">
              {complete
                ? `${formatDateRange(complete)} · ${days} ${days === 1 ? "day" : "days"}`
                : draft.from
                  ? "Now pick an end date."
                  : "Pick a start date."}
            </p>
          </div>

          <div className="flex flex-col gap-1.5 border-t p-2 sm:col-start-1 sm:row-start-2 sm:border-r">
            <Button disabled={!complete || tooLong || unchanged} onClick={apply}>
              Apply
            </Button>
            {onClear ? (
              <Button
                disabled={!current.from && !current.to}
                onClick={() => {
                  onClear();
                  setOpen(false);
                }}
                variant="ghost"
              >
                Clear
              </Button>
            ) : null}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
