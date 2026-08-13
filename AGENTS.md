<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Product vision

This repo is one org-scoped car-rental product with **two faces**. Keep both in mind on every change.

## Faces

1. **Zeke Car Rentals (public)** — Cebu, DTI-registered customer brand. Landing, live availability, clear daily rates, airport/hotel/city pickup, self-drive or with driver. Job: book a car without calling staff first.
2. **City Rentals (ops)** — Owner/admin platform for the same organization. Job: run fleet, rentals, customers, and GPS tracking with reliable location truth.

Same Supabase org and data; different routes, UX, and roles.

## Who uses it

| Role | Surface | Job |
|------|---------|-----|
| **Customer** | Public site + booking | Browse available cars → reserve (guest or signed-in/Google) |
| **Staff** | No ops UI yet | Role exists in data/RLS; cannot enter `app/(protected)` |
| **Owner / admin** | Ops app (`app/(protected)`) | Fleet, GPS, geofences, users, customers, rentals, alerts, org settings |

Authorization is always `profiles.role` + RLS/RPCs. Never authorize from JWT `user_metadata`.

**Protected routes:** only `owner` and `admin` (`ADMIN_ROLES` / `isAdminRole`). Customers and staff hitting ops URLs go to `/access-disabled?reason=role`.

## Core loops

**Customer:** Find dates/location → see available fleet → continue as guest or sign in → submit reservation → confirmation (soft commit; staff confirms pickup; no payments yet).

**Ops (owner/admin):** Manage vehicles/customers/rentals → transition rental (`draft → reserved → active → completed/cancelled`) with booking gates → watch map/geofences/alerts → acknowledge issues → tune org tracking settings.

## Domain (org-scoped)

Organizations · profiles · vehicles · customers · rentals · inspections · payments · settings.

- **Ops (owner/admin)** operate almost all of this day to day via the protected app.
- **Customers** only consume the booking slice: available vehicles + creating a rental (and a customer/profile row when they book or sign in). They do not manage org settings.

**Ops build priority: rental first.** Fleet records, customers, rentals, and public booking are the current scope — see `APPLICATION_FEATURES.md`.

**GPS tracking is parked.** Devices, live map, route history, geofences, and tracking alerts moved to `GPS_TRACKING_FEATURES.md`. Existing tracking code (`src/features/tracking|devices|geofences|alerts` and the `map`, `devices`, `geofences`, `alerts` routes) stays compiling but is not extended. Do not add tracking scope without confirming first.

**Vehicle vs rental status:** `vehicles.status` is operational only (`available` / `maintenance` / `inactive`). Whether a car is reserved for a day comes from rental date ranges (`reserved` / `active` / `overdue`), not from tagging the vehicle row.

## Out of scope (for now)

GPS tracking (parked — see `GPS_TRACKING_FEATURES.md`) · online payments / accounting · public live-tracking links for renters · native apps · remote immobilize / OBD · AI fraud / facial recognition · multi-branch finance.

## Known gaps (do not invent as done)

- Brand naming still splits across Zeke (public), City Rentals (ops), and demo “Northline” copy — prefer Zeke for customer UI, City Rentals for ops UI unless unifying.
- `/register` creates an **ops workspace (admin + org)**, not a customer account.
- Customer Google signup exists; email customer signup and a “my bookings” portal are not complete yet.
- Self-drive / with-driver is landing UX only — not a rental domain field yet.
- `staff` role exists in the schema but cannot access `app/(protected)` yet (owner/admin only).
- Tracking surfaces (map, devices, geofences, alerts) exist in code but are **parked** — they are not part of the current rental-first scope.

## UI conventions (all agents)

Portable rules for Cursor, Claude, Codex, and other coding agents. Visual tokens and layout detail live in `DESIGN_SYSTEM.md` — follow these bullets for component choices.

- **shadcn first:** Prefer existing `components/ui/*` and project wrappers. Do not hand-roll Button, Input, Dialog, Table, Empty, etc. when a shadcn equivalent exists or can be added.
- **Add missing shadcn via MCP/CLI:** If a needed component is not in `components/ui`, add it with the **shadcn MCP** (or `npx shadcn@latest add …`). Do not copy-paste one-off substitutes.
- **Ops / resource tables:** Use the project `DataTable` stack with **server-side pagination** — `components/data-table/*` and `src/features/shared/components/resource-table*`. Do not build client-only one-off tables for paginated resource lists.
- **Empty lists and tables:** Use the shadcn Empty primitive (`components/ui/empty.tsx`) for empty table bodies, empty lists, and “no results” states.
- **Searchable dropdowns:** Use a **Combobox** (Command + Popover pattern from shadcn). Prefer plain `Select` only for short, fixed option sets with no search.
- **Form field row alignment:** Multi-field form rows (grids/flex) must use **top alignment** (`items-start`), not `items-end` / `items-center`. Error messages grow one field and otherwise shove sibling fields out of line. Keep submit actions aligned with inputs via a label-height spacer when needed (e.g. invisible `FieldLabel`).

## Data loading and feedback (all agents)

Four kinds of wait, four distinct signals. Never show two at once for the same event.

| Signal | Fires when | Renders | Previous content |
|---|---|---|---|
| `loading.tsx` skeleton | The **route** changes (`/vehicles` → `/customers`) | Page body | Gone |
| **In-place linear bar** | Only **searchParams** change (search, sort, page, filter) | Reserved 2px slot above the table | **Stays, dimmed, non-interactive** |
| `<Suspense>` | One **panel** is slower than the rest | That panel | Rest of page paints immediately |
| Global top bar | A **write** is in flight | Fixed under the header | Untouched |

- **Never full-page reload.** No `<form method="get">` for filters, ever. Refining a list is `router.replace(url, { scroll: false })` inside a transition — use `useDebouncedNavigation` (`src/features/shared/hooks/use-debounced-navigation.ts`), which is the single mechanism for search, sort, paging, and filter controls.
- **Filters auto-apply.** Text search debounces 300ms; Enter applies immediately; discrete controls (Select, radio) apply on change; native date inputs debounce on change and commit on blur. No Apply/Search button — the loading bar is the feedback, not the button.
- **Keep the previous rows visible.** Never blank a table or flash a skeleton on keystroke. Dim to `opacity-60 pointer-events-none` while stale; leave the toolbar crisp so the focused input stays legible.
- **Zero layout shift.** The progress slot is always in the DOM at fixed height (`DataTableLoadingBar`). Gate visibility through `useDelayedPending` so fast responses show nothing and slow ones don't strobe.
- **Progress, not spinners.** Use `components/ui/progress.tsx` with `value={null}` for waits of unknown length. Never `animate-pulse` as a progress affordance. Any indeterminate animation needs an explicit `prefers-reduced-motion` override — the blanket rule in `globals.css` freezes animations at frame 0.
- **Announce results, not busyness.** The bar is `aria-hidden`; the row-count summary carries `aria-live="polite"`. Never announce on every keystroke.
- **URL is the only filter state.** Every filter lives in `searchParams` so lists are shareable and back/forward works. Omit params that equal their default (`resourceTableUrl`). Changing a filter resets to page 1.
- **Success is a toast, errors are inline.** `toast.success()` from sonner for writes — the user is often navigating away. Field errors go on the `Field`; form-level errors stay in a persistent `<Alert>` next to what needs fixing. Never both for one event.
- **Every mutation action calls `revalidateResource(route)`.** The client cache is on (`experimental.staleTimes.dynamic: 30`), so a write that only calls `router.refresh()` leaves stale rows in other cached entries and other tabs.
- **Empty means two things.** Filtered-zero names the search term back and offers "Clear search"; true-zero offers the create CTA. Use `ResourceEmptyState`, rendered inside the table body so headers survive.
- **Never client-filter a server-paginated table.** `DataTable`'s `filterKey` searches only the loaded page; on a paginated resource list it silently reports the rest as absent.
