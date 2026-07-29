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

Organizations · profiles · vehicles · GPS devices · customers · rentals · geofences · location history · tracking events/alerts · settings.

- **Ops (owner/admin)** operate almost all of this day to day via the protected app.
- **Customers** only consume the booking slice: available vehicles + creating a rental (and a customer/profile row when they book or sign in). They do not manage devices, geofences, alerts, or org settings.

**Ops MVP priority:** reliable vehicle tracking first; rental management supports tracking, not the other way around. Detailed feature/spec history lives in `APPLICATION_FEATURES.md`.

**Vehicle vs rental status:** `vehicles.status` is operational only (`available` / `maintenance` / `inactive`). Whether a car is reserved for a day comes from rental date ranges (`reserved` / `active` / `overdue`), not from tagging the vehicle row.

## Out of scope (for now)

Online payments / accounting · public live-tracking links for renters · native apps · remote immobilize / OBD · AI fraud / facial recognition · multi-branch finance.

## Known gaps (do not invent as done)

- Brand naming still splits across Zeke (public), City Rentals (ops), and demo “Northline” copy — prefer Zeke for customer UI, City Rentals for ops UI unless unifying.
- `/register` creates an **ops workspace (admin + org)**, not a customer account.
- Customer Google signup exists; email customer signup and a “my bookings” portal are not complete yet.
- Self-drive / with-driver is landing UX only — not a rental domain field yet.
- `staff` role exists in the schema but cannot access `app/(protected)` yet (owner/admin only).

## UI conventions (all agents)

Portable rules for Cursor, Claude, Codex, and other coding agents. Visual tokens and layout detail live in `DESIGN_SYSTEM.md` — follow these bullets for component choices.

- **shadcn first:** Prefer existing `components/ui/*` and project wrappers. Do not hand-roll Button, Input, Dialog, Table, Empty, etc. when a shadcn equivalent exists or can be added.
- **Add missing shadcn via MCP/CLI:** If a needed component is not in `components/ui`, add it with the **shadcn MCP** (or `npx shadcn@latest add …`). Do not copy-paste one-off substitutes.
- **Ops / resource tables:** Use the project `DataTable` stack with **server-side pagination** — `components/data-table/*` and `src/features/shared/components/resource-table*`. Do not build client-only one-off tables for paginated resource lists.
- **Empty lists and tables:** Use the shadcn Empty primitive (`components/ui/empty.tsx`) for empty table bodies, empty lists, and “no results” states.
- **Searchable dropdowns:** Use a **Combobox** (Command + Popover pattern from shadcn). Prefer plain `Select` only for short, fixed option sets with no search.
- **Form field row alignment:** Multi-field form rows (grids/flex) must use **top alignment** (`items-start`), not `items-end` / `items-center`. Error messages grow one field and otherwise shove sibling fields out of line. Keep submit actions aligned with inputs via a label-height spacer when needed (e.g. invisible `FieldLabel`).
