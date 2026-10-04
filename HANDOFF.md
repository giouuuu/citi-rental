# Handoff: `feat/analytics-live-dashboard-rls`

_As of 2026-10-04. Branch is pushed and in sync with `origin/feat/analytics-live-dashboard-rls`. No PR is open. `main` is at `4ab606b`._

Read `AGENTS.md` first — it holds the product vision, the UI conventions and the data-loading rules. This file covers only what this branch changed and what is still open.

## What the branch does

Five commits on top of `main`, most of the volume being SQL:

| Commit | What |
|---|---|
| `7b0534e` | **Security + analytics + live dashboard.** Customers can no longer read other customers' records, rentals, vehicles or drivers (org-scoped SELECT policies checked the org but not the role). Public booking can no longer overwrite a matched customer's identity fields, which closed a phone-number-based booking-history takeover. New `/analytics` (owner/admin) backed by `analytics_*` RPCs bucketed by Manila day, with period-over-period deltas. Dashboard reads live data instead of the hardcoded GPS demo. Customer detail gains a Rentals tab with lifetime value and balance. `/reports` revenue stops double-counting penalties. Adds `rentals.booking_source`, `cancelled_at`, `cancellation_reason`; cancelling now requires a reason. Adds Playwright e2e (`npm run test:e2e`) and pgTAP-in-Docker (`npm run db:verify`). |
| `393a91f` | `FINANCIAL_STATEMENT_PLAN.md` — what a BIR-ready statement needs (cash-basis gross receipts, expenses mapped to itemized-deduction lines, per-vehicle depreciation register, tax position worksheet). **Plan only, no code.** |
| `0708bcd` | **Drops the organization dimension from the database** (`20261004120000_single_tenant_drop_organizations.sql`, ~3.6k lines). `organizations` becomes `company_profile` (one row: name, timezone, deposit percent, payment instructions). 70 org-dependent policies keep their role test and drop the tenant test; 26 function bodies lose their tenant predicates. Role guards become null-safe. Uniqueness rules (plates, licences, rental references, default inspection template) are recreated *before* the column drops. `register` becomes bootstrap-only. The migration aborts if more than one organization exists. |
| `93576a3` | Removes the org plumbing from the app — 44 files, net −65 lines, mostly deletion of `.eq("organization_id", …)` that RLS already enforced. Storage paths drop the tenant segment; existing objects keep their old names and stay readable. `/register` no longer asks for an org name. Settings read/write `company_profile`. Ops shell falls back to "City Rentals" instead of the demo "Northline" copy. |
| `523e03f` | `AGENTS.md`, `APPLICATION_FEATURES.md`, `README.md` updated for the single-tenant model. |

## Must do before deploying

In this order:

1. **Point your Supabase tooling at the right project.** See the warning below — this is a real trap.
2. **Run the preflight against the real project.** `scripts/single-tenant-preflight.sql` (untracked, read-only, writes nothing) goes into the Supabase SQL editor; read the `verdict` column. Any `BLOCKED` row means the single-tenant migration will abort. It runs in a transaction so a failure rolls back cleanly, but you lose the attempt. The delete script at the bottom — for removing a second organization — is **destructive and irreversible** and is deliberately left commented out. Back up first.
3. **Apply the pending migrations to the hosted project**, in filename order. Check `list_migrations` first and skip any already applied:
   - `20260814090000_vehicle_expense_ledger.sql` (from `main`)
   - `20260929100000_restrict_org_reads_to_staff.sql`
   - `20260929101000_public_booking_identity_hardening.sql`
   - `20260929102000_rental_booking_source_and_cancellation.sql`
   - `20260929103000_analytics_rpcs.sql`
   - `20261004110000_vehicle_expenses_single_tenant.sql` — must run before the next one; it converts the expense ledger, whose policies would otherwise block the drop of `current_organization_id()`
   - `20261004120000_single_tenant_drop_organizations.sql`
   - `20261005090000_financial_statements.sql`
   - `20261005100000_vehicle_loans.sql`
   - `20261006090000_vehicle_maintenance.sql`
   - `20261007090000_vehicle_showcase_image.sql`

   As of `7b0534e` none of these had been applied (the hosted project was paused). **Still unconfirmed** — confirm with `list_migrations` against the correct project before applying.
4. **Deploy the app only after the migrations land.** The app no longer sends `organization_id` and reads `company_profile`, so this build is broken against the old schema.

## ⚠️ The Supabase MCP here points at the wrong project

`.mcp.json` (untracked) is configured with `--project-ref=elfrdfvezhkrhijahahg`. That project is **not** this product — querying it returns an unrelated e-commerce/delivery schema (`orders`, `riders`, `zones`, `carts`, …) and none of the rental migrations.

The rental project is `oyphktvlxfklfrdxknit` ("citi-rentals", giouuuu's Org), which is what `next.config.ts` and `FEATURE_AUDIT.md` both name. Fix the ref in `.mcp.json` before running any Supabase MCP call from this repo, and never apply a migration through it as currently configured.

## How to verify

```bash
npm run typecheck   # clean at 93576a3
npm run lint        # 0 errors, 2 pre-existing React Compiler warnings
npm test            # vitest, 136 unit tests passed at 93576a3
npm run test:e2e    # Playwright, demo mode
npm run db:verify   # Docker: applies all 29 migrations + pgTAP, 122 assertions passed
npm run check       # lint + typecheck + test
```

## Untracked files

- `scripts/single-tenant-preflight.sql` — the preflight from step 2. Worth committing.
- `.mcp.json` — Supabase MCP config. Reads `SUPABASE_ACCESS_TOKEN` from the environment and holds no secret, but has the wrong project ref (above). Fix before committing, if committing at all.
- `HANDOFF.md` — this file.

## Open items

- **Hosted migration state is still unverified**, because the only MCP connection available points elsewhere. This is the one gate between the branch and a deploy.
- **No PR is open.** The commit bodies are detailed enough to build the description from.
- **Financial statements**: `FINANCIAL_STATEMENT_PLAN.md` is a plan. The build has no expense, profit or VAT handling at all.
- Open rows in `FEATURE_AUDIT.md` worth knowing about: `R-5` (draft bookings are excluded from the overlap check and never expire — two customers can both deposit on the same car and dates, `high`), `R-2` (`transition_rental` is bypassable via a direct `UPDATE … SET status`), `R-3`/`R-4` (the overdue sweep is render-triggered and fails silently).
- Known gaps in `AGENTS.md` are unchanged: no email customer signup, no "my bookings" portal, self-drive/with-driver is landing copy rather than a domain field, `staff` cannot enter `app/(protected)`, GPS tracking is parked.

## Gotchas for whoever picks this up

- **Never authorize from a nullable role check.** In plpgsql, `v_role not in (...)` is NULL for a caller with no profile, and a NULL `if` is treated as false — so the guard silently passes. Use the `exists()`-based helpers the single-tenant migration introduces.
- **Storage objects come in two path shapes:** legacy `<org>/<rental>/file` and new `<rental>/file`. `customer_can_read_inspection_object()` matches the rental id in *any* path segment. Do not "fix" it back to a fixed index.
- **`/register` is bootstrap-only.** It provisions the first admin under a table lock and then permanently refuses. Intentional: with one shared company, open signup would hand admin over the real business to anyone who completed signup.
- **Analytics and reports use Manila day boundaries** (`src/features/shared/lib/manila-time.ts`). Reuse it; UTC dates cut over 8 hours late.
- **`vehicles.status` is operational only.** Whether a car is booked for a day comes from rental date ranges, never from tagging the vehicle row.
