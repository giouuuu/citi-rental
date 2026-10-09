"use client"

import * as React from "react"
import { ClockIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { inputSurfaceClassName } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

const ITEM_HEIGHT = 40
/** Rows a wheel shows; odd, so one sits dead centre under the band. */
const VISIBLE_ROWS = 5
const WHEEL_PADDING = ((VISIBLE_ROWS - 1) / 2) * ITEM_HEIGHT
/** How long a wheel must sit still before the centred row counts as picked. */
const SETTLE_MS = 120
/** What a fresh wheel shows before anything is picked. */
const FALLBACK_TIME = "09:00"

type Period = "AM" | "PM"
type TimeParts = { hour: number; minute: number; period: Period }
type WheelOption<T> = { value: T; label: string }

function pad(n: number) {
  return String(n).padStart(2, "0")
}

/** `HH:mm` (24-hour) to a 12-hour clock face. */
function parseTime(value: string | null | undefined): TimeParts | undefined {
  const match = /^(\d{2}):(\d{2})/.exec(value ?? "")
  if (!match) return undefined
  const hours = Number(match[1])
  const minute = Number(match[2])
  if (hours > 23 || minute > 59) return undefined
  return { hour: hours % 12 || 12, minute, period: hours < 12 ? "AM" : "PM" }
}

function toTimeValue({ hour, minute, period }: TimeParts) {
  return `${pad((hour % 12) + (period === "PM" ? 12 : 0))}:${pad(minute)}`
}

function formatParts({ hour, minute, period }: TimeParts) {
  return `${hour}:${pad(minute)} ${period}`
}

const HOURS: WheelOption<number>[] = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: String(i + 1),
}))

const PERIODS: WheelOption<Period>[] = [
  { value: "AM", label: "AM" },
  { value: "PM", label: "PM" },
]

/** Minutes on the step, plus an off-step minute already stored so it still shows. */
function minuteOptions(step: number, current?: number): WheelOption<number>[] {
  const minutes = Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step)
  if (current !== undefined && !minutes.includes(current)) {
    minutes.push(current)
    minutes.sort((a, b) => a - b)
  }
  return minutes.map((minute) => ({ value: minute, label: pad(minute) }))
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

/**
 * One scroll-snapping drum. Swipe, scroll, click a row or use the arrow keys;
 * the row that comes to rest under the centre band is the value.
 */
function WheelColumn<T extends string | number>({
  id,
  label,
  options,
  value,
  onValueChange,
}: {
  id: string
  label: string
  options: WheelOption<T>[]
  value: T
  onValueChange: (value: T) => void
}) {
  const scrollerRef = React.useRef<HTMLDivElement>(null)
  const settleTimer = React.useRef<number | undefined>(undefined)
  const frame = React.useRef<number | undefined>(undefined)
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  )
  const [scrollTop, setScrollTop] = React.useState(selectedIndex * ITEM_HEIGHT)

  // The settle timer reads these after renders it didn't see.
  const latest = React.useRef({ value, options, onValueChange })
  React.useLayoutEffect(() => {
    latest.current = { value, options, onValueChange }
  })

  // Open on the current value, before paint and without animating to it.
  React.useLayoutEffect(() => {
    const scroller = scrollerRef.current
    if (scroller) scroller.scrollTop = selectedIndex * ITEM_HEIGHT
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only where it opens
  }, [])

  React.useEffect(
    () => () => {
      window.clearTimeout(settleTimer.current)
      if (frame.current) cancelAnimationFrame(frame.current)
    },
    []
  )

  function scrollToIndex(index: number) {
    scrollerRef.current?.scrollTo({
      top: index * ITEM_HEIGHT,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    })
  }

  function select(index: number) {
    const clamped = Math.min(options.length - 1, Math.max(0, index))
    const next = options[clamped]
    if (next.value !== value) onValueChange(next.value)
    scrollToIndex(clamped)
  }

  function handleScroll() {
    const scroller = scrollerRef.current
    if (!scroller) return
    if (frame.current) cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => setScrollTop(scroller.scrollTop))

    window.clearTimeout(settleTimer.current)
    settleTimer.current = window.setTimeout(() => {
      const { value: current, options: rows, onValueChange: change } = latest.current
      const index = Math.min(
        rows.length - 1,
        Math.max(0, Math.round(scroller.scrollTop / ITEM_HEIGHT))
      )
      if (rows[index].value !== current) change(rows[index].value)
    }, SETTLE_MS)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = {
      ArrowUp: selectedIndex - 1,
      ArrowDown: selectedIndex + 1,
      PageUp: selectedIndex - 5,
      PageDown: selectedIndex + 5,
      Home: 0,
      End: options.length - 1,
    }
    if (!(event.key in moves)) return
    event.preventDefault()
    select(moves[event.key])
  }

  return (
    <div
      aria-activedescendant={`${id}-${selectedIndex}`}
      aria-label={label}
      className="relative z-10 w-16 snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-md outline-none [mask-image:linear-gradient(to_bottom,transparent,black_30%,black_70%,transparent)] [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-ring/30 [&::-webkit-scrollbar]:hidden"
      onKeyDown={handleKeyDown}
      onScroll={handleScroll}
      ref={scrollerRef}
      role="listbox"
      style={{
        height: VISIBLE_ROWS * ITEM_HEIGHT,
        paddingBlock: WHEEL_PADDING,
        perspective: 600,
      }}
      tabIndex={0}
    >
      {options.map((option, index) => {
        // Rows curve away from the band, like the face of a drum.
        const offset = Math.max(
          -3,
          Math.min(3, (index * ITEM_HEIGHT - scrollTop) / ITEM_HEIGHT)
        )
        const selected = index === selectedIndex
        return (
          <div
            aria-selected={selected}
            className={cn(
              "flex cursor-pointer snap-center items-center justify-center text-base tabular-nums select-none",
              selected ? "font-semibold text-foreground" : "text-muted-foreground"
            )}
            id={`${id}-${index}`}
            key={String(option.value)}
            onClick={() => select(index)}
            role="option"
            style={{
              height: ITEM_HEIGHT,
              transform: `rotateX(${offset * -20}deg)`,
              opacity: 1 - Math.abs(offset) * 0.2,
            }}
          >
            {option.label}
          </div>
        )
      })}
    </div>
  )
}

type TimePickerProps = {
  /** An `HH:mm` (24-hour) time; "" when empty. */
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  /** Spacing of the minute wheel. */
  minuteStep?: number
  placeholder?: string
  /** Submits the `HH:mm` value with a native form. */
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
 * The one time control: an Input-styled trigger that opens hour, minute and
 * AM/PM wheels in a popover. Speaks `HH:mm`, the shape a native time input
 * does, so it drops in for `type="time"`.
 */
function TimePicker({
  value,
  defaultValue,
  onValueChange,
  minuteStep = 5,
  placeholder = "Pick a time",
  name,
  id,
  disabled,
  required,
  className,
  align = "end",
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: TimePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue ?? "")
  const current = value ?? uncontrolled
  const selected = parseTime(current)
  const [draft, setDraft] = React.useState<TimeParts>(
    () => selected ?? parseTime(FALLBACK_TIME)!
  )
  // Fixed per opening, so the wheel's rows don't shift under the finger.
  const [keptMinute, setKeptMinute] = React.useState(selected?.minute)
  const baseId = React.useId()
  const minutes = React.useMemo(
    () => minuteOptions(minuteStep, keptMinute),
    [minuteStep, keptMinute]
  )

  function commit(next: string) {
    if (value === undefined) setUncontrolled(next)
    onValueChange?.(next)
  }

  // Wheels apply as they settle, so tapping away keeps what was turned to.
  function turn(next: Partial<TimeParts>) {
    const parts = { ...draft, ...next }
    setDraft(parts)
    commit(toTimeValue(parts))
  }

  return (
    // Modal so the wheels take the scroll when they sit inside a Dialog.
    <Popover
      modal
      onOpenChange={(next) => {
        if (next) {
          setDraft(selected ?? parseTime(FALLBACK_TIME)!)
          setKeptMinute(selected?.minute)
        }
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
            "flex cursor-pointer items-center gap-2 text-left tabular-nums data-[state=open]:border-ring data-[state=open]:ring-2 data-[state=open]:ring-ring/30",
            !selected && "text-muted-foreground",
            className
          )}
          data-slot="time-picker-trigger"
          disabled={disabled}
          id={id}
          type="button"
        >
          <ClockIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="truncate">
            {selected ? formatParts(selected) : placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-auto gap-0 overflow-hidden p-0"
        collisionPadding={16}
      >
        <div className="relative flex justify-center gap-1 px-3 py-2">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-3 rounded-md bg-muted"
            style={{ top: 8 + WHEEL_PADDING, height: ITEM_HEIGHT }}
          />
          <WheelColumn
            id={`${baseId}-hour`}
            label="Hour"
            onValueChange={(hour) => turn({ hour })}
            options={HOURS}
            value={draft.hour}
          />
          <span
            aria-hidden="true"
            className="relative z-10 flex items-center text-base font-semibold"
          >
            :
          </span>
          <WheelColumn
            id={`${baseId}-minute`}
            label="Minute"
            onValueChange={(minute) => turn({ minute })}
            options={minutes}
            value={draft.minute}
          />
          <WheelColumn
            id={`${baseId}-period`}
            label="AM or PM"
            onValueChange={(period) => turn({ period })}
            options={PERIODS}
            value={draft.period}
          />
        </div>
        <div className="flex items-center justify-between gap-2 border-t p-2">
          {required ? (
            <span />
          ) : (
            <Button
              disabled={!current}
              onClick={() => {
                commit("")
                setOpen(false)
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              Clear
            </Button>
          )}
          <Button
            onClick={() => {
              // Opened and closed untouched still sets the time shown.
              if (!selected) commit(toTimeValue(draft))
              setOpen(false)
            }}
            size="sm"
            type="button"
          >
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { TimePicker }
