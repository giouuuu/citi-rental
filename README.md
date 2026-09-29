# City Rentals

Car-rental operations and public booking built with Next.js 16, TypeScript, Tailwind CSS, shadcn/ui, TanStack Table, and Supabase.

## Scope

The current build is **rental-first**: fleet records, customers, rentals, and the public booking flow. The spec is `APPLICATION_FEATURES.md`.

GPS tracking (devices, live map, route history, geofences, tracking alerts, Traccar) is **parked** — its spec lives in `GPS_TRACKING_FEATURES.md`. Tracking code already in the repo stays compiling but is not being extended.

Feature destinations from later milestones are intentionally represented by clear placeholder states. Their data services, validation, permissions, and tests will be introduced together in the milestone that owns them.

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and add Supabase project credentials.
3. Start Supabase locally with `npx supabase start`, or link an existing project.
4. Apply migrations with `npx supabase db reset` for local development.
5. Create the first organization and administrator profile with a trusted server-side process or the Supabase SQL editor.
6. Run the app with `npm run dev`.

Without Supabase environment variables, the app runs in a clearly labeled UI demo mode so the design foundation can be reviewed. Authentication and data access are enforced once project credentials are configured.

## Verification

- `npm run lint`
- `npm run typecheck` (run `npx next typegen` first on a fresh clone)
- `npm test`
- `npm run build`
- `npm run test:e2e` — Playwright against the app in demo mode (Supabase env vars forced empty, so it never touches a real database). Needs Chromium: `npx playwright install chromium`.
- `npm run db:verify` — applies every migration to a throwaway `supabase/postgres` Docker container and runs the pgTAP suites in `supabase/tests/` (RLS, public booking identity, cancellation, analytics). Needs Docker running.

## Analytics

`/analytics` (owner/admin) reports revenue, bookings by source, fleet utilization, per-car performance, idle cars, customer mix, top customers, and how full the next 30 days are. Numbers come from the `analytics_*` RPCs in `20260929103000_analytics_rpcs.sql`, bucketed by Manila day. Definitions that matter:

- **Collected** = confirmed deposits, balances, and adjustments minus refunds, dated by confirmation. Penalties are billed charges, not money — they never count as collected.
- **Utilization** = rented car-days ÷ available car-days (non-inactive cars), a partial day counting as a day.
- **Outstanding** = what cars that have gone out still owe (quote + penalties − collected). Reserved balances are due at pickup, so they are excluded.

## Security notes

- Use a Supabase publishable key in the browser; never expose `SUPABASE_SERVICE_ROLE_KEY`.
- Server-side route protection validates JWT claims rather than trusting session storage.
- Authorization roles live in `public.profiles`, not user-editable metadata.
- All exposed business tables use RLS and explicit grants.
# citi-rental
