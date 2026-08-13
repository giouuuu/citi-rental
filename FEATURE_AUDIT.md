# Feature Audit — rental scope

Living list of feature gaps and improvements. **Append rows as you find them** — this file is
meant to accumulate, not to be rewritten. Anything logged here is a candidate for the next
build; nothing here is a commitment.

Scope is the rental product (fleet, customers, rentals, inspections, payments, public booking),
matching `APPLICATION_FEATURES.md`. GPS/tracking is parked — see `GPS_TRACKING_FEATURES.md`.
Tracking items appear here only where parked code leaks into a rental surface.

**Severity:** `high` = wrong data, money, or a broken core loop · `medium` = real friction or a
convention break · `low` = polish.
**Status:** `open` · `fixed` · `wontfix` · `parked`.

Last swept: 2026-08-10. Migrations through `20260810093000` are applied to `citi-rentals`
(`oyphktvlxfklfrdxknit`, giouuuu's Org).

---

## Money and billing

| ID | Gap | Impact | Severity | Status |
|----|-----|--------|----------|--------|
| M-1 | Return-inspection **fuel charge** never reached the payments ledger. `rental_inspections.fuel_charge_amount` was stored and shown on the condition report, but no `payments` row was created, so `balance_due` and `payment_status` ignored it. (Damage charges already posted correctly — only fuel was orphaned.) | Staff saw a charge on the condition report that the invoice did not reflect. Under-billing. | high | **fixed** — `20260810090000_inspection_fuel_charge_ledger.sql`, incl. backfill |
| M-2 | Penalty rows are written with `method = 'other'` for money that never moved. The payments panel shows a payment method for an accrued charge. | Mildly misleading ledger copy. Kept for consistency with existing damage rows; changing it needs a data migration. | low | open |
| M-3 | No way to waive or reverse an inspection penalty from the UI. The only path is a manual `refund`/`adjustment` payment. | Staff must know the ledger to correct a mistaken charge. | medium | open |

## Rentals

| ID | Gap | Impact | Severity | Status |
|----|-----|--------|----------|--------|
| R-1 | Rentals were never marked overdue automatically, despite the spec requiring it. Nothing moved `active → overdue`, so every overdue count read zero unless staff transitioned by hand. | Overdue rentals were invisible on the dashboard and in reports. | high | **fixed** — `20260810093000_overdue_rental_sweep.sql` + `sweepOverdueRentals()` |
| R-2 | `transition_rental` still accepts `active`/`completed` at the **database** level. The inspection requirement is enforced in `transitionRentalAction` only, so a direct RPC call skips the checklist entirely. | The condition checklist is bypassable by anything that isn't the ops UI. | medium | open |
| R-3 | The overdue sweep skips rows whose booking-rule trigger rejects the update (e.g. a customer blocked after pickup) and does so silently. `isRentalOverdue()` covers the display side, but nothing tells staff a row is stuck. | A permanently-`active` rental with no visible signal. | medium | open |
| R-4 | The sweep runs on `/rentals` and `/dashboard` renders. A workspace nobody opens never sweeps. | Overdue status is only as fresh as the last ops page view. Acceptable for one branch; revisit if a scheduled job becomes available. | low | open |

## Inspections

| ID | Gap | Impact | Severity | Status |
|----|-----|--------|----------|--------|
| I-1 | No UI to edit checklist template **items**. Admins can clone a category template (`clone_inspection_template_for_category`), but cannot add, remove, rename, or reorder lines. The 33 seeded items are effectively hardcoded. | Every org inspects the same 33 points whether or not they fit the fleet. | medium | open |
| I-2 | An inspection can never be amended or voided — `unique (rental_id, inspection_type)` plus an explicit raise in the RPC. A mistyped odometer is permanent, and the inspection has already transitioned the rental. | No correction path for the single most error-prone screen in ops. | high | open |
| I-3 | `submit_rental_inspection` has been redefined across two migrations already. Anyone editing it must copy from the **newest** definition (`20260810090000`), not the original. | A stale copy silently reverts the damage/fuel ledger posting. | medium | open (documented) |
| I-4 | Known damages carry onto the vehicle automatically, but resolution is manual and there is no reminder. Stale damages accumulate. | The known-damages panel loses signal over time. | low | open |

## Reports

| ID | Gap | Impact | Severity | Status |
|----|-----|--------|----------|--------|
| P-1 | The reports screen queried `tracking_events` and `gps_devices` for "Unresolved alerts" and "Offline trackers", and exported tracking-event and GPS-point CSVs. | Parked GPS scope presented as live product on a rental surface. | medium | **fixed** — replaced with rental metrics + vehicle revenue/utilization report |
| P-2 | No print-friendly report page. The spec asks for one; only the inspection report prints today. | Minor — CSV covers most needs. | low | open |
| P-3 | Reports have no "rentals by period" breakdown separate from the per-vehicle view. | The per-vehicle report covers most of it; a time series would need a chart. | low | open |

## UI conventions

| ID | Gap | Impact | Severity | Status |
|----|-----|--------|----------|--------|
| U-1 | `window.confirm` used for cancel-rental and confirm-deposit, violating the confirm-dialog convention in `AGENTS.md` §9.14. | Native browser dialog, unstyled, untestable, inconsistent with every other destructive action. | medium | **fixed** — `ConfirmActionDialog` in `features/shared`; `ArchiveButton` now delegates to it |
| U-2 | Ops nav (`lib/navigation.ts`) still lists Live map, GPS devices, Geofences, Alerts, and Integrations. | Parked scope presented as working navigation. Clicking leads to surfaces nobody maintains. | medium | open |
| U-3 | Brand naming splits across Zeke (public), City Rentals (ops), and leftover demo "Northline" copy. | Inconsistent identity across surfaces. | low | open |

## Resilience

| ID | Gap | Impact | Severity | Status |
|----|-----|--------|----------|--------|
| E-1 | `listVehiclePhotos` did `if (error) throw error` while every sibling service (`listVehicleKnownDamages`, `listVehicleRentals`) logs and returns an empty list. A missing `vehicle_photos` table took the entire vehicle detail page down — form, rental history, damages and all. | One optional panel's query could 500 a whole ops page. | high | **fixed** — degrades to an empty gallery and logs |
| E-2 | Deployed schema drifted three migrations behind the repo with no signal in the app. The first symptom was a 500 on a detail page. | Nothing surfaces "your database is behind" until something breaks. A startup schema check or a CI `db push --dry-run` gate would catch it. | medium | open |
| E-3 | `tracking-service.ts` and `settings-service.ts` still `throw new Error(error.message)` on query failure (parked GPS scope, so not fixed here). Same failure mode as E-1 if their tables drift. | A schema gap on those tables 500s their pages. | low | open |

## Booking and roles

| ID | Gap | Impact | Severity | Status |
|----|-----|--------|----------|--------|
| B-1 | `/register` creates an **ops workspace** (admin + organization), not a customer account. | A customer who clicks "register" provisions an org. | high | open |
| B-2 | Customer Google sign-in works, but email-based customer signup and the "my bookings" portal are incomplete. | Customers can't self-serve their own bookings. | medium | open |
| B-3 | Self-drive vs with-driver is landing-page copy only — not a rental domain field. | The booking cannot record what the customer actually chose. | medium | **partly addressed** — a `drivers` roster + CRUD now exists; the rental link below is what remains |
| B-5 | `rentals` has no `driver_id` and no self-drive/with-driver flag, so a driver cannot yet be assigned to a booking. The `drivers` table already carries a composite `(organization_id, id)` key so that FK can be added without rework. | Drivers can be managed but not actually booked; `daily_rate` doesn't reach any quote. | medium | open |
| B-6 | No double-booking guard for drivers. Once `driver_id` exists, a driver needs the same date-range exclusion `rentals` already enforces for vehicles. | The same driver could be assigned to two overlapping rentals. | medium | open |
| B-4 | `staff` exists in the schema and RLS but cannot enter `app/(protected)`; ops is owner/admin only. | Staff can't use the ops app they have permissions for. | medium | open |

## Testing and tooling

| ID | Gap | Impact | Severity | Status |
|----|-----|--------|----------|--------|
| T-1 | No `vitest.config.*`, no jsdom, no Testing Library. Vitest runs bare in node, so **no component test is possible today** — only pure-lib tests. | Every form, dialog, and screen is untested. Adding the config + `jsdom` + `@testing-library/react` is a prerequisite for testing anything with JSX. | high | open |
| T-2 | No end-to-end test for the core loop (login → vehicle → customer → booking → start → complete). The spec asks for one. | Regressions in the main workflow surface only in manual testing. | medium | open |
| T-3 | No RLS policy tests. Authorization correctness rests on review alone. | A policy regression would be silent. | medium | open |

---

## How to add a row

Pick the area table, take the next ID in that prefix, and describe the gap in terms of what
goes wrong for a user — not what the code looks like. Keep `Impact` to one sentence. New areas
get a new table.
