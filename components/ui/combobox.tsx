"use client"

import * as React from "react"
import { ChevronsUpDownIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { inputSurfaceClassName } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

type ComboboxOption = {
  value: string
  label: string
  /** Muted second line under the label. */
  description?: string
  /** Extra words the search box matches, e.g. a plate number. */
  keywords?: string[]
  /** Options sharing a group render under one heading, in first-seen order. */
  group?: string
  disabled?: boolean
}

/** Past this many options the list gets a search box. */
const SEARCHABLE_AT = 8

/** Matches labels and keywords only — never raw values such as UUIDs. */
function filterOptions(_value: string, search: string, keywords?: string[]) {
  const needle = search.trim().toLowerCase()
  if (!needle) return 1
  return keywords?.some((word) => word.toLowerCase().includes(needle)) ? 1 : 0
}

/**
 * The one option picker: a Popover + Command list behind a trigger that looks
 * exactly like an Input. Short lists open as a plain list; long ones get a
 * search box. Pass `name` to submit the value with a native form.
 */
function Combobox({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder = "Select an option",
  searchPlaceholder = "Search…",
  emptyMessage = "No matches.",
  searchable,
  name,
  id,
  disabled,
  required,
  className,
  contentClassName,
  align = "start",
  side,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: {
  options: readonly ComboboxOption[]
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  /** Defaults to on once the list is long enough to need it. */
  searchable?: boolean
  name?: string
  id?: string
  disabled?: boolean
  required?: boolean
  className?: string
  contentClassName?: string
  align?: "start" | "center" | "end"
  side?: "top" | "right" | "bottom" | "left"
  "aria-invalid"?: boolean | "true" | "false"
  "aria-label"?: string
  "aria-describedby"?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue ?? "")
  const current = value ?? uncontrolled
  const selected = options.find((option) => option.value === current)
  const withSearch = searchable ?? options.length >= SEARCHABLE_AT
  const groups = [...new Set(options.map((option) => option.group))]
  // On open, bring the selected option into view in a long list.
  const revealChecked = React.useCallback((list: HTMLDivElement | null) => {
    list
      ?.querySelector('[data-checked="true"]')
      ?.scrollIntoView({ block: "nearest" })
  }, [])

  function pick(next: string) {
    if (value === undefined) setUncontrolled(next)
    onValueChange?.(next)
    setOpen(false)
  }

  return (
    // Modal so the list scrolls when the picker sits inside a Dialog.
    <Popover modal onOpenChange={setOpen} open={open}>
      {name ? (
        <input name={name} required={required} type="hidden" value={current} />
      ) : null}
      <PopoverTrigger asChild>
        <button
          aria-describedby={ariaDescribedBy}
          aria-expanded={open}
          aria-invalid={ariaInvalid}
          aria-label={ariaLabel}
          className={cn(
            inputSurfaceClassName,
            "flex cursor-pointer items-center justify-between gap-2 text-left data-[state=open]:border-ring data-[state=open]:ring-2 data-[state=open]:ring-ring/30",
            !selected && "text-muted-foreground",
            className
          )}
          data-slot="combobox-trigger"
          disabled={disabled}
          id={id}
          // eslint-disable-next-line jsx-a11y/role-has-required-aria-props -- PopoverTrigger adds aria-controls
          role="combobox"
          type="button"
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronsUpDownIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className={cn(
          "w-(--radix-popover-trigger-width) min-w-48 p-0",
          contentClassName
        )}
        collisionPadding={16}
        side={side}
      >
        <Command defaultValue={current || undefined} filter={filterOptions} loop>
          {withSearch ? (
            <CommandInput aria-label={searchPlaceholder} placeholder={searchPlaceholder} />
          ) : null}
          <CommandList ref={revealChecked}>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup heading={group} key={group ?? "options"}>
                {options
                  .filter((option) => option.group === group)
                  .map((option) => (
                    <CommandItem
                      data-checked={option.value === current}
                      disabled={option.disabled}
                      key={option.value}
                      keywords={[option.label, ...(option.keywords ?? [])]}
                      onSelect={() => pick(option.value)}
                      value={option.value}
                    >
                      {option.description ? (
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate">{option.label}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {option.description}
                          </span>
                        </span>
                      ) : (
                        <span className="truncate">{option.label}</span>
                      )}
                    </CommandItem>
                  ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export { Combobox, type ComboboxOption }
