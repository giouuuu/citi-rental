# DESIGN.md — Portable Ops UI Design System

A reusable design contract for admin / operations applications: sidebar shell, server-paginated resource tables, combobox filters, and a calm teal-on-navy palette with **tight corner radii**.

Drop this file into the root of a new project. Coding agents (Claude Code, Cursor, Codex) should read it before writing any UI, and follow it over their own defaults.

**Stack this assumes:** Next.js (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui (Radix primitives) · TanStack Table · react-hook-form + zod · lucide-react · sonner.

---

## 0. Rules that override an agent's defaults

1. **Never hand-roll a component that shadcn provides.** Button, Input, Select, Dialog, Sheet, Table, Badge, Empty, Command, Popover, Sidebar — all come from `components/ui/*`.
2. **Missing component → add it with the shadcn MCP** (see §1). Never paste a one-off substitute.
3. **Resource lists are server-paginated `DataTable`s.** Never a client-only `<table>`, never `filterKey` client filtering on a paginated list.
4. **Table filters are Comboboxes, not Selects.** See §7. Plain `Select` is only for ≤6 fixed options with no search need.
5. **Corners are tight.** Max radius on any control is 8px, on any card 10px. See §3.
6. **URL is the only filter state.** Search, sort, page, and filters all live in `searchParams`.
7. **Filters auto-apply.** No Apply/Search button, ever. No `<form method="get">`.
8. **Forms run on react-hook-form + zod.** One `useForm` per form, `zodResolver`, `Controller` for Radix fields. Never a `useState` per input. See §10.
9. **Success is a toast; errors are inline.** Never both for one event.

---

## 1. shadcn setup and the MCP workflow

### Initialize

```bash
npx shadcn@latest init
```

`components.json` should end up like this (Tailwind v4 → empty `tailwind.config`, CSS variables on):

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "radix-nova",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

### Register the shadcn MCP server

Give the agent the MCP so it can search the registry, read real component source, and install — instead of inventing markup. The CLI writes the client config for you:

```bash
npx shadcn@latest mcp init --client claude   # or: cursor | vscode | codex | opencode
```

That produces a checked-in `.mcp.json`, so every teammate and agent on the repo gets the same server:

```json
{
  "mcpServers": {
    "shadcn": {
      "command": "npx",
      "args": ["shadcn@latest", "mcp"]
    }
  }
}
```

Restart the client afterwards, then confirm the tools are live by asking the agent to list registry items.

**Agent workflow when a UI need arises:**

1. Search the registry through the shadcn MCP for the component.
2. Read its docs/demo/source through the MCP before writing anything.
3. Install it, then compose — do not fork or restyle the primitive unless the token layer can't express the change.

**Without MCP**, the same CLI verbs work directly and agents should use them instead of guessing:

```bash
npx shadcn@latest search <query>       # find items across configured registries
npx shadcn@latest view <item>          # inspect an item's files before installing
npx shadcn@latest docs <component>     # docs, API reference, usage examples
npx shadcn@latest add <component>      # install
```

### Baseline component inventory

Install these up front; every pattern in this document is built from them.

| Group | Components |
|---|---|
| Shell | `sidebar`, `separator`, `breadcrumb`, `avatar`, `dropdown-menu`, `tooltip` |
| Data | `table`, `badge`, `progress`, `skeleton`, `empty`, `tabs` |
| Filters | `command`, `popover`, `input-group`, `select`, `calendar` |
| Forms | `button`, `input`, `textarea`, `label`, `field`, `checkbox`, `spinner` (state via `react-hook-form` + `@hookform/resolvers`) |
| Overlay | `dialog`, `alert-dialog`, `sheet`, `drawer`, `alert`, `sonner` |

Plus `@tanstack/react-table` for the table engine and `cmdk` (pulled in by `command`) for the combobox.

---

## 2. Design tokens

Paste into `app/globals.css`. Tailwind v4 — no config file needed.

```css
@import "tailwindcss";

@theme inline {
  --font-sans: var(--font-inter);
  --font-mono: var(--font-ibm-plex-mono);
  --font-heading: var(--font-inter);

  /* Tight radius scale — see §3 */
  --radius-sm: 0.25rem;   /*  4px */
  --radius-md: 0.375rem;  /*  6px */
  --radius-lg: 0.5rem;    /*  8px */
  --radius-xl: 0.625rem;  /* 10px */
  --radius-2xl: 0.75rem;  /* 12px */

  --shadow-xs: 0 1px 2px rgb(15 23 42 / 0.04);
  --shadow-sm: 0 1px 3px rgb(15 23 42 / 0.08), 0 1px 2px rgb(15 23 42 / 0.04);
  --shadow-md: 0 8px 24px rgb(15 23 42 / 0.08);
  --shadow-lg: 0 16px 40px rgb(15 23 42 / 0.12);

  /* map every semantic name to a variable so dark mode is one block */
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-popover: var(--popover);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-info: var(--info);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-border: var(--sidebar-border);
}

:root {
  --radius: 0.375rem;        /* 6px base — shadcn derives from this */

  --background: #f8fafc;
  --foreground: #0f172a;
  --card: #ffffff;
  --popover: #ffffff;
  --primary: #0f766e;        /* teal 600 — the single action color */
  --primary-foreground: #ffffff;
  --secondary: #0b1728;      /* navy 900 */
  --secondary-foreground: #ffffff;
  --muted: #f1f5f9;
  --muted-foreground: #475569;
  --accent: #effbf9;
  --accent-foreground: #0b5e59;
  --destructive: #b42318;
  --border: #e2e8f0;
  --input: #cbd5e1;
  --ring: #14968b;

  --success: #15803d;  --success-surface: #ecfdf3;
  --warning: #b45309;  --warning-surface: #fff7e6;
  --info:    #2563eb;  --info-surface:    #eff6ff;
  --danger-surface: #fef3f2;

  /* dark chrome for the sidebar even in light mode */
  --sidebar: #0b1728;
  --sidebar-foreground: #dce8f0;
  --sidebar-primary: #2bb6a8;
  --sidebar-primary-foreground: #07111f;
  --sidebar-accent: #112f3e;
  --sidebar-accent-foreground: #ffffff;
  --sidebar-border: #18314d;
}

.dark {
  --background: #07111f;
  --foreground: #f1f5f9;
  --card: #0b1728;
  --popover: #0b1728;
  --primary: #2bb6a8;
  --primary-foreground: #07111f;
  --muted: #11233a;
  --muted-foreground: #cbd5e1;
  --accent: #112f3e;
  --destructive: #f87171;
  --border: #334155;
  --input: #475569;
  --ring: #2bb6a8;
  --sidebar: #07111f;
  --sidebar-accent: #11233a;
  --sidebar-border: #334155;
}
```

**Color discipline**

- One action color (`primary` teal). Everything clickable-and-primary is teal; nothing decorative is.
- Navy (`secondary` / sidebar) is chrome — navigation, headers, dark surfaces. Never a button fill.
- Semantic colors only carry meaning, never decoration. Always pair color with a label or icon — never color alone.
- An optional gold accent (`#c5a03a`) is for premium/selected emphasis only. Never a primary button.

**Avoid:** neon, heavy gradients, glassmorphism, more than one accent per screen, oversized rounded cards.

---

## 3. Radius — tight by default

Corners read "engineered", not "playful". The scale above is deliberately ~35% tighter than the shadcn default.

| Element | Class | Value |
|---|---|---|
| Badge, tag, chip inline in a row | `rounded-sm` | 4px |
| Menu item, table cell affordance, skeleton | `rounded-md` | 6px |
| **Button, Input, Select, Textarea, Combobox trigger** | `rounded-lg` | **8px** |
| Card, table container, popover, dialog, command palette | `rounded-xl` | 10px |
| Sheet, drawer, full-bleed panel | `rounded-2xl` | 12px |
| Avatar, status dot, icon button in a toolbar | `rounded-full` | — |

Rules:
- Never exceed 12px on any surface. Never `rounded-3xl`.
- A child inside a rounded parent uses **one step smaller**, never the same.
- Nested radius math: inner = outer − padding. `rounded-[calc(var(--radius)-3px)]` inside an 8px group.
- Square (`rounded-none`) is correct for segmented controls, table headers, and full-width bars.

---

## 4. Typography and spacing

**Fonts:** Inter (UI + headings), IBM Plex Mono (IDs, plates, amounts, timestamps).

```ts
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400","500"], variable: "--font-ibm-plex-mono" });
```

Enable Inter's alternates on `body`: `font-feature-settings: "cv02","cv03","cv04","cv11";`

| Role | Size / weight |
|---|---|
| Page title | `text-2xl font-semibold tracking-tight` |
| Section heading | `text-sm font-semibold` |
| Body / table cell | `text-sm` |
| Secondary, hints, captions | `text-xs text-muted-foreground` |
| Overline / group label | `text-[10px] uppercase tracking-[0.12em]` |
| Numeric data | `font-mono tabular-nums` |

**Spacing:** 4px base. Card padding `p-4`; page gutters `px-4 md:px-6 xl:px-8`; page rhythm `py-6 md:py-8`; gap between form fields `gap-4`; between sections `space-y-6`.

**Elevation:** `shadow-xs` on table containers and cards. `shadow-md` for popovers/dropdowns. `shadow-lg` only for sheets/dialogs. Never stack shadows on nested elements.

---

## 5. App shell — sidebar layout

The shell is shadcn `sidebar` in `collapsible="icon"` mode, dark navy against a light content area, with the page body capped and centered.

```tsx
// components/app-shell/app-shell.tsx
<SidebarProvider
  style={{ "--sidebar-width": "16rem", "--sidebar-width-icon": "4.5rem" } as React.CSSProperties}
>
  <AppSidebar organizationName={org} userName={name} userRole={role} />
  <SidebarInset id="main-content">
    <TopHeader />
    <div className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 md:px-6 md:py-8 xl:px-8">
      {children}
    </div>
  </SidebarInset>
</SidebarProvider>
```

**Sidebar anatomy** (top → bottom):

1. `SidebarHeader` — brand mark in a `size-8 rounded-md bg-sidebar-primary` tile, product name + org name stacked, whole block links to the dashboard. Bottom border in `sidebar-border`.
2. `SidebarContent` — `SidebarGroup` per domain area. Group labels are overline-styled (`text-[10px] uppercase tracking-[0.12em] text-sidebar-foreground/45`). Items are `SidebarMenuButton asChild` wrapping a `Link`, each with a lucide icon and a `tooltip` prop so icon-collapsed mode stays usable. Counts go in `SidebarMenuBadge`.
3. `SidebarFooter` — user avatar + name + role opening a `DropdownMenu` (profile, settings, sign out).
4. `SidebarRail` — the drag-to-collapse edge. Always include it.

**Navigation is data, not markup.** Keep one `lib/navigation.ts` exporting `navigationGroups: { label, items: { href, label, icon }[] }[]`, so the sidebar, breadcrumbs, and command palette all read the same source.

**Active state:** compare `usePathname()` — exact match for index routes, `startsWith` for detail routes. Active item = `bg-sidebar-accent text-sidebar-accent-foreground`, never a color-only cue.

**Top header:** sticky, `h-14`, holds `SidebarTrigger`, breadcrumbs, a global search/command trigger (`⌘K`), and the theme toggle. It is also the mount point for the global mutation progress bar (§8).

---

## 6. The table system

Three layers — keep them separate:

```
components/data-table/
  data-table.tsx              # generic TanStack shell: header, body, column visibility, empty slot
  data-table-column-header.tsx# sortable header button (asc / desc / none)
  data-table-loading-bar.tsx  # 2px indeterminate bar in a fixed-height slot
  data-table-pagination.tsx   # client-side pager (non-paginated tables only)

features/shared/components/
  resource-table.tsx          # server-paginated wrapper: owns ONE transition for search+sort+page+filters
  resource-table-columns.tsx  # column factory (title cell links to the detail route)
  resource-empty-state.tsx    # filtered-zero vs true-zero
  resource-search-form.tsx    # debounced, uncontrolled search input
  resource-filter-combobox.tsx# §7
```

**Container:** `overflow-x-auto rounded-xl border border-border bg-card shadow-xs`.
**Header:** `bg-muted/40`, `text-xs font-medium text-muted-foreground`, sticky when the table scrolls.
**Rows:** `h-12`, `border-b border-border`, `hover:bg-muted/50`. First column is the entity title, `font-medium`, linking to the detail route. IDs/plates/amounts get `font-mono tabular-nums`. Amounts and counts are right-aligned.
**Status cells:** `Badge` with a semantic surface + a dot — never a bare colored word.
**Row actions:** a single trailing `⋯` `DropdownMenu`, right-aligned, `w-px whitespace-nowrap` column.

### Server pagination is the default

The table never receives the full dataset. The page (a Server Component) reads `searchParams`, queries `range(offset, offset + pageSize)`, and passes `rows`, `page`, `pageSize`, `hasNextPage`.

**Never** pass `filterKey` to a server-paginated `DataTable` — it filters only the loaded page and silently reports the rest as absent.

### URL is the state

```ts
// features/shared/lib/resource-table-url.ts
resourceTableUrl(route, currentQuery, changes, fallbackSort) // → "/vehicles?q=abc&sort=name&page=2"
```

- Every filter, the search term, sort, direction, and page live in `searchParams`.
- Omit any param equal to its default — clean, shareable URLs.
- Changing any filter **resets to page 1**.
- Navigation is always `router.replace(url, { scroll: false })` inside a transition — refining a list is not a back-stack destination.

### One hook drives every control

```ts
// features/shared/hooks/use-debounced-navigation.ts
const { isPending, isDirty, navigate, navigateNow, cancel } = useDebouncedNavigation();
```

- `navigate(url)` — debounced 300ms. Text search as you type.
- `navigateNow(url)` — immediate. Enter, sort, page, and every discrete control (combobox, select, radio, date blur).
- `isPending` — a real round trip; drives the loading bar.
- Clear the timer on unmount, or a queued replace fires after the user has left.

Search, sort, paging, and filters share **one** transition, which is why the progress bar sits above the table rather than at the top of the viewport.

---

## 7. Filters are Comboboxes

A dropdown that can't be typed into is a dead end as soon as the option list grows past a screenful. **Every table filter is a Combobox** — shadcn `Command` inside a `Popover`.

| Control | Use when |
|---|---|
| **Combobox** | Any table filter. Any list that can grow (customers, vehicles, users, tags, locations). Anything ≥7 options. Any picker where the user knows the name but not the position. |
| `Select` | ≤6 fixed options that will never grow — page size, sort direction, yes/no. |
| Segmented `Tabs` | 2–4 mutually exclusive views that deserve permanent visibility (All / Active / Archived). |

**Behavior contract**

- Trigger is an `outline` Button, `h-9 rounded-lg`, showing the **selected label** — not the field name — plus a `ChevronsUpDown` icon. Unselected shows `All {plural}` in muted text.
- Popover opens with the search input focused; `CommandInput` filters as you type.
- Selecting **applies immediately** via `navigateNow` and closes the popover. No Apply button.
- Selecting the active value again clears the filter (toggle-off), as does an explicit `All {plural}` first item.
- Selected option carries a trailing `Check` icon.
- Multi-select variant: stays open, shows a `Checkbox` per row, trigger shows `Status: 2` as a `secondary` Badge, and commits on close.
- Async options: fetch on open, show `CommandEmpty` → "No matches", keep a `Spinner` in the input's trailing addon while loading.

### Reference implementation

```tsx
"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type FilterOption = { value: string; label: string; hint?: string };

/**
 * The one filter control for resource tables. Applies on select — the loading
 * bar is the feedback, not a submit button.
 */
export function ResourceFilterCombobox({
  label,
  options,
  value,
  onChange,
  allLabel = "All",
  className,
}: {
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
  allLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  const commit = (next: string) => {
    onChange(next === value ? "" : next); // re-selecting clears
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          className={cn("h-9 w-full justify-between rounded-lg sm:w-48", className)}
          role="combobox"
          variant="outline"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected?.label ?? allLabel}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        <Command>
          <CommandInput placeholder={`Filter by ${label.toLowerCase()}…`} />
          <CommandList>
            <CommandEmpty>No {label.toLowerCase()} found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__all" onSelect={() => commit("")}>
                <Check className={cn("size-4", value ? "opacity-0" : "opacity-100")} />
                {allLabel}
              </CommandItem>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.hint ?? ""}`}
                  onSelect={() => commit(option.value)}
                >
                  <Check
                    className={cn(
                      "size-4",
                      value === option.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{option.label}</span>
                  {option.hint ? (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {option.hint}
                    </span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

Wire it into the toolbar:

```tsx
<ResourceFilterCombobox
  label="Status"
  options={STATUS_OPTIONS}
  value={query.status}
  onChange={(status) => navigateNow(urlFor({ status, page: 1 }))}
/>
```

**Inside a form**, the same combobox is driven by react-hook-form rather than the URL — wrap it in a `<Controller>` and let `field.value` / `field.onChange` replace the `value` / `onChange` props. See §10.

**Toolbar layout:** search input first (`max-w-md`, grows), then filter comboboxes in a `flex flex-wrap gap-2`, then a right-aligned `Columns` dropdown and the primary `+ Add {singular}` button. When ≥2 filters are active, show a ghost `Clear all` button that resets to the bare route.

---

## 8. Loading and feedback — four waits, four signals

Never show two at once for the same event.

| Signal | Fires when | Renders | Previous content |
|---|---|---|---|
| `loading.tsx` skeleton | The **route** changes | Page body | Gone |
| **In-place linear bar** | Only **searchParams** change (search, sort, page, filter) | Reserved 2px slot above the table | **Stays, dimmed, non-interactive** |
| `<Suspense>` | One **panel** is slower than the rest | That panel | Rest of the page paints immediately |
| Global top bar | A **write** is in flight | Fixed under the header | Untouched |

- **Keep previous rows visible.** While stale: `opacity-60 pointer-events-none select-none` on the table container only. The toolbar stays crisp so the focused input remains legible.
- **Zero layout shift.** The 2px slot is always in the DOM (`<div className="h-0.5">`), gated through a `useDelayedPending` hook (~120ms in, minimum ~300ms visible) so fast responses show nothing and slow ones don't strobe.
- **Progress, not spinners.** `Progress` with an indeterminate value for unknown-length waits. Never `animate-pulse` as a progress affordance.
- **Announce results, not busyness.** The bar is `aria-hidden`; the table carries `aria-busy`; the row-count summary carries `aria-live="polite"`. Never announce per keystroke.
- **Success is a toast** (`toast.success()` — the user is often navigating away). **Errors are inline**: field errors on the `Field`, form-level errors in a persistent `Alert` next to what needs fixing.
- **Every mutation revalidates its route** on the server (`revalidatePath`/`revalidateTag`), not just `router.refresh()` — with a client cache enabled, a refresh-only write leaves stale rows in other cached entries and other tabs.

---

## 9. Empty, error, and skeleton states

**Empty means two things** — use shadcn `Empty`, rendered *inside the table body* so headers and chrome survive:

- **Filtered-zero:** `SearchX` icon, names the term back ("No vehicles match "civic""), offers **Clear search**.
- **True-zero:** `Inbox` icon, explains what the list is for, offers the create CTA (only if the user can write).

**Skeletons** mirror the real layout: same row height, same column count, `rounded-md`, 5–7 rows. Never a spinner for a page load.

**Errors:** `error.tsx` per route segment with a plain-language message and a Retry button. Destructive confirmations use `AlertDialog` with the object's name in the body and the verb in the button ("Archive vehicle"), never "OK".

---

## 10. Forms

**Every form uses react-hook-form.** No ad-hoc `useState` per input, no uncontrolled `FormData` scraping on submit. One `useForm` owns the values, the validation, the dirty/pending state, and the error surface.

```bash
npm i react-hook-form @hookform/resolvers zod
```

### The contract

```tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { vehicleSchema, type VehicleValues } from "@/features/vehicles/schemas/vehicle-schema";
import { applyServerFieldErrors, valuesToFormData } from "@/features/shared/lib/form-utils";

export function VehicleForm({ row, action }: VehicleFormProps) {
  const form = useForm<VehicleValues>({
    resolver: zodResolver(vehicleSchema),   // same schema the server action validates with
    defaultValues: buildDefaultValues(row), // never feed server props into `value`
  });

  async function onSubmit(values: VehicleValues) {
    const result = await action(valuesToFormData(values, row?.id ? { __id: row.id } : undefined));

    if (!result.success) {
      applyServerFieldErrors(form.setError, result.fieldErrors); // server truth wins
      setFormError(result.message);                             // form-level → inline <Alert>
      return;
    }
    toast.success(row ? "Vehicle saved." : "Vehicle created.");
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {/* fields */}
    </form>
  );
}
```

Rules:

- **One zod schema per form, shared with the server action.** `zodResolver` on the client, the same schema re-parsed on the server. The client copy is UX; the server copy is the security boundary.
- **`defaultValues` come from the row once.** Never bind a server prop straight into a field's `value` — an in-flight response will clobber what the user is typing.
- **`noValidate` on the `<form>`** so RHF/zod own the messages instead of the browser's native bubbles.
- **Validate on submit, re-validate on change** (RHF's default). Don't validate on every keystroke before the first submit — it scolds people mid-typing.
- **Register natively, `Controller` for Radix.** Plain `Input`/`Textarea` use `{...form.register("name")}`. Anything with its own internal state — `Select`, Combobox, `Checkbox`, date picker, file input, signature pad — goes through `<Controller>` (or `useController`) so RHF stays the single source of truth.
- **Server errors map back onto fields.** Keep a shared helper that walks `result.fieldErrors` into `form.setError(name, { type: "server", message })`, so a server-side uniqueness failure lands on the field that caused it, not in a generic banner.
- **Bridge to FormData once, in a helper.** If your server actions take `FormData`, convert RHF values in one shared `valuesToFormData()` — booleans → `"on"`, empty strings dropped, `File`/`FileList` unwrapped — instead of hand-building FormData in every form.
- **Pending state comes from the form, not a local flag.** `form.formState.isSubmitting` (or a shared mutation coordinator) drives the submit button's `Spinner` and `disabled`.
- **Guard navigation with `formState.isDirty`** on long forms; leave short ones alone.
- **Reset after success** with `form.reset(values)` when the user stays on the page, so `isDirty` clears and the form stops warning about unsaved changes.
- Wrap fields in shadcn `Field` / `FieldLabel` / `FieldDescription` / `FieldError`, and render `formState.errors[name]?.message` in the `FieldError`.

### Layout and affordances

- **Multi-field rows use `items-start`**, never `items-end` / `items-center` — an error message grows one field and shoves its siblings out of alignment. Keep an inline submit aligned with a label-height spacer (an invisible `FieldLabel`).
- Required fields get a `text-destructive` asterisk; optional fields are labeled "(optional)" only when the surrounding form is mostly required.
- Submit buttons show a `Spinner` and stay disabled while pending; never hide the button.
- Destructive actions are `variant="destructive"`, placed away from the primary action, behind a confirm.
- Long forms: sticky footer with Cancel (ghost, left) and Save (primary, right). Multi-step forms get a numbered stepper, one scroll region, and a sticky footer owning Back/Continue — steps never render their own inline action buttons.
- Panels inside a fixed-width Sheet/Dialog must use **container queries** (`@container` + `@md:`/`@3xl:`), never viewport breakpoints — `lg:grid-cols-2` inside a 672px sheet is how cramped two-column layouts happen.

---

## 11. Motion and accessibility

- Durations: 120ms (hover/focus), 150–200ms (dropdown/popover), 250ms (sheet/dialog). Easing `cubic-bezier(0.2, 0.8, 0.2, 1)`.
- Animate `opacity` and `transform` only. Never animate layout properties.
- Any indeterminate animation needs an explicit `prefers-reduced-motion` override if the global rule freezes animations.
- Contrast: 4.5:1 body, 3:1 large text and UI borders. Verify sidebar foreground against sidebar navy.
- Focus is always visible: `focus-visible:ring-3 focus-visible:ring-ring/50`. Never remove outlines.
- Hit targets ≥ 36×36px (`h-9` controls), ≥ 44px on touch surfaces.
- Every icon-only button gets an `aria-label`. Every table has a caption or an `aria-label`.
- Status is never color-only — pair with text, icon, or shape.

---

## 12. File structure

```
app/
  (public)/                  # marketing + customer-facing
  (auth)/
  (protected)/               # ops app behind the sidebar shell
    layout.tsx               # auth + role gate → <AppShell>
    <resource>/
      page.tsx               # server: reads searchParams, queries a page, renders the table
      [id]/page.tsx
      new/page.tsx
      loading.tsx            # route-change skeleton
      error.tsx
components/
  ui/                        # shadcn primitives — edit only via the MCP/CLI
  app-shell/                 # app-shell, app-sidebar, top-header
  data-table/                # generic table layer
src/features/<domain>/
  actions/                   # "use server" mutations, one per file
  components/
  hooks/
  lib/
  schemas/                   # zod
  services/                  # server-side reads
  types/
lib/navigation.ts            # single nav source of truth
```

---

## 13. Pre-ship checklist

- [ ] No hand-rolled equivalent of an existing shadcn component.
- [ ] New primitives were added through the shadcn MCP/CLI, not pasted.
- [ ] No radius above 12px anywhere; controls are 8px.
- [ ] Every table filter is a Combobox; `Select` only survives on ≤6 fixed options.
- [ ] No Apply/Search button; no `<form method="get">`.
- [ ] Every filter/sort/page value round-trips through `searchParams`; defaults omitted; filter change resets to page 1.
- [ ] Rows stay visible and dimmed during refinement — no flashing skeleton, no blank table.
- [ ] The 2px progress slot is in the DOM at all times; no layout shift on load.
- [ ] `filterKey` is not set on any server-paginated table.
- [ ] Filtered-zero and true-zero empty states are distinct and render inside the table body.
- [ ] Every form runs on react-hook-form + `zodResolver`, sharing its schema with the server action.
- [ ] Radix-based fields (Select, Combobox, Checkbox, date, file) are wired through `Controller`, not local `useState`.
- [ ] Server `fieldErrors` are mapped back onto fields with `setError`, not dumped into one banner.
- [ ] Writes: toast on success, inline `Alert`/`FieldError` on failure, route revalidated.
- [ ] Sidebar collapses to icon mode with tooltips intact; active item is not color-only.
- [ ] Sheet/dialog internals use container queries, not viewport breakpoints.
- [ ] Dark mode verified; focus rings visible on every interactive element.
