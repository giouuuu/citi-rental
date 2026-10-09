"use client"

import * as React from "react"
import { format, isValid, parse } from "date-fns"
import { CalendarIcon } from "lucide-react"
import type { DropdownProps } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { inputSurfaceClassName } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TimePicker } from "@/components/ui/time-picker"

/** Date keys (`YYYY-MM-DD`) are calendar days, so they map to local midnight. */
function keyToDate(key: string | null | undefined) {
  if (!key) return undefined
  const date = parse(key, "yyyy-MM-dd", new Date())
  return isValid(date) ? date : undefined
}

function dateToKey(date: Date) {
  return format(date, "yyyy-MM-dd")
}

/**
 * Month and year jumps as shadcn Selects rather than the browser's own list,
 * so the caption matches the rest of the picker.
 */
function CalendarDropdown({
  options,
  value,
  onChange,
  disabled,
  "aria-label": ariaLabel,
}: DropdownProps) {
  return (
    <Select
      disabled={disabled}
      onValueChange={(next) =>
        onChange?.({
          target: { value: next },
        } as React.ChangeEvent<HTMLSelectElement>)
      }
      value={String(value)}
    >
      <SelectTrigger aria-label={ariaLabel} className="h-8 gap-1 border-none px-2 font-medium shadow-none hover:bg-muted">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-64" position="popper">
        {options?.map((option) => (
          <SelectItem
            disabled={option.disabled}
            key={option.value}
            value={String(option.value)}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** How far the month/year dropdowns reach when no min/max bounds them. */
const YEARS_BACK = 80
const YEARS_AHEAD = 20

type DatePickerProps = {
  /** A `YYYY-MM-DD` key; "" when empty. */
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  /** Earliest pickable day, as a `YYYY-MM-DD` key. */
  min?: string
  /** Latest pickable day, as a `YYYY-MM-DD` key. */
  max?: string
  placeholder?: string
  /** Submits the key with a native form. */
  name?: string
  id?: string
  disabled?: boolean
  /** Hides Clear; with `name`, the hidden input is required too. */
  required?: boolean
  className?: string
  align?: "start" | "center" | "end"
  "aria-invalid"?: boolean | "true" | "false"
  "aria-label"?: string
  "aria-describedby"?: string
}

/**
 * The one single-date control: an Input-styled trigger that opens the shadcn
 * Calendar in a popover. Speaks `YYYY-MM-DD` keys, the same shape a native
 * date input and a Postgres `date` use, so it drops in for `type="date"`.
 */
function DatePicker({
  value,
  defaultValue,
  onValueChange,
  min,
  max,
  placeholder = "Pick a date",
  name,
  id,
  disabled,
  required,
  className,
  align = "start",
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue ?? "")
  const current = value ?? uncontrolled
  const selected = keyToDate(current)
  const minDate = keyToDate(min)
  const maxDate = keyToDate(max)
  const [month, setMonth] = React.useState<Date | undefined>(selected)

  const thisYear = new Date().getFullYear()
  const startMonth = minDate ?? new Date(thisYear - YEARS_BACK, 0)
  const endMonth = maxDate ?? new Date(thisYear + YEARS_AHEAD, 11)
  const today = dateToKey(new Date())
  const todayAllowed = (!min || today >= min) && (!max || today <= max)

  function commit(next: string) {
    if (value === undefined) setUncontrolled(next)
    onValueChange?.(next)
    setOpen(false)
  }

  return (
    // Modal so the calendar takes the wheel when it sits inside a Dialog.
    <Popover
      modal
      onOpenChange={(next) => {
        // Reopen on the picked month, not wherever the last visit left off.
        if (next) setMonth(selected ?? maxDate ?? new Date())
        setOpen(next)
      }}
      open={open}
    >
      {name ? (
        <input name={name} required={required} type="hidden" value={current} />
      ) : null}
      <PopoverTrigger asChild>
        {/* eslint-disable-next-line jsx-a11y/role-supports-aria-props -- drives the shared invalid styling */}
        <button
          aria-describedby={ariaDescribedBy}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-invalid={ariaInvalid}
          aria-label={ariaLabel}
          className={cn(
            inputSurfaceClassName,
            "flex cursor-pointer items-center gap-2 text-left data-[state=open]:border-ring data-[state=open]:ring-2 data-[state=open]:ring-ring/30",
            !selected && "text-muted-foreground",
            className
          )}
          data-slot="date-picker-trigger"
          disabled={disabled}
          id={id}
          type="button"
        >
          <CalendarIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="truncate">
            {selected ? format(selected, "MMM d, yyyy") : placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-auto gap-0 overflow-hidden p-0"
        collisionPadding={16}
      >
        <Calendar
          autoFocus
          captionLayout="dropdown"
          className="[--cell-size:--spacing(9)]"
          components={{ Dropdown: CalendarDropdown }}
          disabled={[
            ...(minDate ? [{ before: minDate }] : []),
            ...(maxDate ? [{ after: maxDate }] : []),
          ]}
          endMonth={endMonth}
          mode="single"
          month={month}
          onMonthChange={setMonth}
          onSelect={(date) => {
            if (date) commit(dateToKey(date))
          }}
          selected={selected}
          startMonth={startMonth}
        />
        <div className="flex items-center justify-between gap-2 border-t p-2">
          {required ? (
            <span />
          ) : (
            <Button
              disabled={!current}
              onClick={() => commit("")}
              size="sm"
              type="button"
              variant="ghost"
            >
              Clear
            </Button>
          )}
          <Button
            disabled={!todayAllowed}
            onClick={() => commit(today)}
            size="sm"
            type="button"
            variant="ghost"
          >
            Today
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

type DateTimeDraft = { date: string; time: string }

function splitDateTime(value: string): DateTimeDraft {
  const [date = "", time = ""] = value.split("T")
  return { date, time: time.slice(0, 5) }
}

/** Only a complete pair is a value; half of one is still a draft. */
function joinDateTime({ date, time }: DateTimeDraft) {
  return date && time ? `${date}T${time}` : ""
}

/**
 * Date and time side by side, speaking the `YYYY-MM-DDTHH:mm` strings a native
 * `datetime-local` input does. Emits "" until both halves are filled.
 */
function DateTimePicker({
  value,
  defaultValue,
  onValueChange,
  name,
  id,
  disabled,
  required,
  className,
  placeholder,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  name?: string
  id?: string
  disabled?: boolean
  required?: boolean
  className?: string
  placeholder?: string
  "aria-invalid"?: boolean | "true" | "false"
  "aria-describedby"?: string
}) {
  const [draft, setDraft] = React.useState(() =>
    splitDateTime(value ?? defaultValue ?? "")
  )
  // Follow outside changes (a form reset) without wiping a half-typed pair,
  // which the parent only ever sees as "".
  const [synced, setSynced] = React.useState(value)
  if (value !== undefined && value !== synced) {
    setSynced(value)
    if (value !== joinDateTime(draft)) setDraft(splitDateTime(value))
  }

  function update(next: DateTimeDraft) {
    setDraft(next)
    onValueChange?.(joinDateTime(next))
  }

  return (
    <div
      className={cn("grid grid-cols-[minmax(0,1fr)_8.5rem] items-start gap-2", className)}
      data-slot="date-time-picker"
    >
      {name ? (
        <input
          name={name}
          required={required}
          type="hidden"
          value={joinDateTime(draft)}
        />
      ) : null}
      <DatePicker
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        disabled={disabled}
        id={id}
        onValueChange={(date) =>
          update(date ? { ...draft, date } : { date: "", time: "" })
        }
        placeholder={placeholder}
        required={required}
        value={draft.date}
      />
      <TimePicker
        aria-invalid={ariaInvalid}
        aria-label="Time"
        disabled={disabled}
        id={id ? `${id}-time` : undefined}
        onValueChange={(time) => update({ ...draft, time })}
        placeholder="Time"
        required={required}
        value={draft.time}
      />
    </div>
  )
}

export { DatePicker, DateTimePicker }
