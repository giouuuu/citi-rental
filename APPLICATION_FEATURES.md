# Car Rental Application — Rental Core Specification

**Document purpose:** the implementation specification for the current build. Scope is the
**rental product**: fleet records, customers, rentals, and public booking.

**GPS tracking is out of scope for now.** Devices, live map, route history, geofences, and
tracking alerts moved to `GPS_TRACKING_FEATURES.md`, which is parked. Do not build from that
file, and do not add new tracking features here. Tracking code that already exists in the repo
stays compiling but is not extended.

Related docs: `AGENTS.md` (product vision and roles) · `NEXTJS-AGENT.md` (architecture rules) ·
`DESIGN_SYSTEM.md` (visual system).

---

## 1. Product Overview

One single-tenant car-rental product with two faces:

1. **Zeke Car Rental & Services (public)** — customers browse the fleet, check availability for their
   dates, and submit a reservation without calling staff first.
2. **City Rentals (ops)** — owner/admin manage the fleet, customers, and rentals, and move each
   rental through its lifecycle.

The build priority is a rental workflow staff can run end to end every day. Everything else
waits.

---

## 2. Technology Stack

### Frontend
- Next.js (App Router) with TypeScript
- Tailwind CSS v4 + shadcn/ui (`components/ui/`)
- Supabase client SDK
- `react-hook-form` + `zod`

### Backend and Data
- Supabase PostgreSQL
- Supabase Authentication
- Supabase Row Level Security
- Supabase Realtime (where it earns its place)

Architecture, folder structure, and layer rules are defined in `NEXTJS-AGENT.md` — follow that
document, not the structure implied by any older spec.

---

## 3. System Architecture

```text
Customer browser ──┐
                   ├──> Next.js (App Router) ──> Supabase PostgreSQL + Auth + RLS
Ops browser ───────┘
```

**Supabase** owns authentication, staff profiles and roles, vehicles, customers, rentals, and
org settings. **The web application** owns the public booking flow, the ops dashboard, the
rental workflow, and vehicle/customer management. There is no integration worker in this scope.

---

## 4. User Roles

Authorization is always `profiles.role` + RLS/RPCs. Never authorize from JWT `user_metadata`.

### Owner / Administrator
- Manage users and roles.
- Manage vehicles.
- Manage customers and rentals.
- Configure org settings.

### Rental Staff
- Manage customers.
- Create and update rentals.
- View vehicle status.
- Cannot manage system users or org settings.

> The `staff` role exists in the schema and RLS but cannot enter `app/(protected)` yet — ops
> routes are owner/admin only. Opening the ops app to staff is a tracked gap, not a bug.

### Customer
- Browse available vehicles, fill in the booking, then sign in when submitting (Google creates the account). The draft, ID photos included, is kept in the browser across sign-in and restored on return. No guest booking: only signed-in accounts can submit.
- No access to ops routes; customers hitting an ops URL go to
  `/access-disabled?reason=role`.

Use Supabase Row Level Security to enforce these permissions. Do not rely only on hidden
frontend controls.

---

## 5. Core Modules

## 5.1 Authentication

Features:
- Email and password login.
- Logout.
- Forgot-password and reset-password flows.
- Google sign-in for customers.
- Protected application routes.
- User profile containing name, role, and active status.
- Disabled users must not access the application.

Acceptance criteria:
- Unauthenticated users hitting an ops route are redirected to login.
- Authenticated users can access only pages allowed by their role.
- Sensitive actions are enforced by database policies, not only by the proxy guard.

`/register` by email provisions the first **admin** on an empty system; after that every
signup is a **customer**. From the booking dialog it carries `?next=` so the guest lands back
on their saved booking (instantly, or via the email confirmation link).

Known gap: a customer "my bookings" portal is incomplete.

---

## 5.2 Dashboard (ops)

Display:
- Total vehicles.
- Available vehicles.
- Currently rented vehicles.
- Vehicles in maintenance.
- Overdue rentals.
- Rentals due for return today.
- Upcoming pickups.
- Recent rental activity.

Vehicle status values (operational only):
- `available`
- `maintenance`
- `inactive` (archive / out of fleet)

Reservation and rental occupancy are **not** stored on the vehicle row. They come from rental
date ranges (`reserved` / `active` / `overdue`), plus any `draft` whose customer already sent the
reservation fee (proof upload or PayMongo) — the dates are held from that moment, before staff
confirm. First payment in wins; a later payment for held dates is recorded for refund.

Acceptance criteria:
- Counts derive from rental date ranges, not from a status column on the vehicle.
- Overdue is computed against expected return, not entered by hand.

---

## 5.3 Vehicle Management

Vehicle fields:
- Internal UUID.
- Plate number.
- Vehicle name.
- Make.
- Model.
- Year.
- Color.
- Vehicle category.
- Transmission.
- Fuel type.
- Seating capacity.
- Current odometer.
- Daily rate.
- Status.
- Photos (gallery).
- Notes.
- Created and updated timestamps.

Features:
- Create vehicle.
- Edit vehicle.
- View vehicle details.
- Soft-disable or archive vehicle.
- Search and filter vehicles.
- Manage the vehicle photo gallery.
- Display current and upcoming rentals (bookings calendar).
- Display rate quote for a date range.

Validation:
- Plate number must be unique across the fleet.
- A vehicle cannot be booked for dates that overlap an existing reserved or active rental.
- Maintenance and inactive vehicles cannot be booked for any dates.
- Photos do not gate `available`: staff can rent a car with no gallery. A car shows on the
  public site and takes online bookings only once all 6 gallery photos are uploaded.

---

## 5.4 Customer Management

Customer fields:
- Internal UUID.
- Full name.
- Email.
- Phone number.
- Address.
- Driver's license number.
- Driver's license expiration.
- Emergency contact name.
- Emergency contact number.
- Facebook profile URL as optional reference only.
- Notes.
- Is blocked.
- Created and updated timestamps.

Features:
- Create customer.
- Edit customer.
- View customer.
- Search customers.
- View rental history.
- Block customer from new rentals.

Privacy:
- Do not automatically scrape or score Facebook accounts.
- Store only the profile URL when voluntarily provided.

---

## 5.5 Rental Management

Rental fields:
- Internal UUID.
- Rental reference number.
- Customer.
- Vehicle.
- Start date and time.
- Expected return date and time.
- Actual return date and time.
- Pickup location.
- Return location.
- Starting odometer.
- Ending odometer.
- Starting fuel level.
- Ending fuel level.
- Rental status.
- Daily rate, billed days, and rent (`quoted_daily_rate × quoted_days = quoted_total`). Staff
  type the rate on the rental form; blank uses the car's daily rate.
- Payment / proof reference when captured.
- Notes.
- Created by.
- Created and updated timestamps.

Rental status:
- `draft`
- `reserved`
- `active`
- `completed`
- `cancelled`
- `overdue`

Features:
- Create rental.
- Assign vehicle and customer.
- Start rental (`reserved → active`).
- Complete rental (`active → completed`).
- Cancel rental.
- Mark rental overdue automatically based on expected return.
- Record pickup and return condition (inspections).
- Running bill on the Bill & payments tab: rent + charges − payments = balance.
- Add optional charges from the owner-maintained charge types (Settings → Charge types):
  car wash, delivery, extension, fuel shortage, damage, other income. Owners/admins can
  remove a charge.
- Record what a charge cost the business (e.g. ₱300 paid to the delivery driver on a ₱500
  delivery charge), when adding it or later from the charge's cost button. The bill shows
  charges, costs paid out, and what you keep. Owners and admins only.
- Extend an active or overdue rental: move the return date (blocked by the next booking) and
  optionally add an Extension charge, suggested as extra days × the daily rate.
- View rental payments.

Business rules:
- A vehicle cannot have overlapping active or reserved rentals (date-range conflicts).
- Vehicle status stays operational (`available` / `maintenance` / `inactive`); rentals do not
  flip the vehicle to reserved or rented.
- Maintenance and inactive vehicles cannot be booked for any dates.
- Once the car is out (active/overdue), dates change only through Extend.
- Charges are confirmed `penalty` rows on the payments ledger tagged with a charge type, so the
  balance, analytics outstanding, and the finance "charges billed" line count them.
- A charge's cost is never on the renter's bill. It is a row in the finance `expenses` ledger
  (`charge_payment_id`, `rental_id`), filed under the charge type's BIR line
  (`rental_charge_types.expense_category_id`, else Miscellaneous). Removing the charge voids
  its cost; the expense row is the one source of the amount, so edits in /finance show on the
  rental.
- A blocked customer cannot start a new rental.
- Every transition validates the current state on the server. Disabling a button is a hint;
  the action and the database re-validate.

---

## 5.6 Public Booking (customer)

Flow: pick dates and location → see available fleet → fill in the booking → sign in on Confirm → submit
reservation → confirmation.

Features:
- Landing page with the customer brand.
- Availability search by date range.
- Fleet listing showing only bookable vehicles for the selected dates.
- Vehicle detail with photos, specs, and daily rate.
- Booking form (signed-in customers only).
- Confirmation page.
- Owner notification when a booking arrives.

Rules:
- Booking is a **soft commit** — staff confirm at pickup. No online payments in this scope.
- Availability is computed from rental date ranges and vehicle operational status, never from
  a "reserved" flag on the vehicle row.
- A booking creates or matches a customer record.
- The public fleet listing never exposes ops-only fields (notes, internal odometer,
  cost data).

Known gap: self-drive vs with-driver is landing-page UX only — it is not a rental domain field
yet.

---

## 5.7 Reports

Reports in this scope:
- Active and overdue rentals.
- Rentals by period.
- Vehicle utilization.
- Revenue by vehicle (rate × days; not accounting).

Features:
- Filter by vehicle and date range.
- Export CSV.
- Print-friendly report page.

Do not implement complex accounting or financial reporting.

---

## 5.8 Analytics (ops)

Owner/admin only (`/analytics`). Filters: period preset or custom dates (Manila, inclusive,
≤ 400 days) and grouping (day/week/month); every filter lives in the URL.

- Headline numbers with period-over-period change: collected revenue, bookings (and website
  share), fleet utilization, outstanding balance, cancellation rate, late-return rate, average
  rental length and lead time, charges billed.
- Trends: collected revenue, bookings by source (website vs front desk), utilization.
- Booked ahead: share of the fleet reserved for each of the next 30 days.
- Cars: collected, utilization, revenue per day, charges per car; idle available cars.
- Customers: active, first-time vs returning, repeat rate, blocked; top customers with lifetime
  value, balance owed, and late returns. Customer detail has a Rentals tab with the same figures.
- Website & Facebook: visitors on the site now (last 5 min, polled every 30s), visitors and
  Facebook visitors with change, visit → booking rate, the open → book funnel (visited → looked
  at a car → started booking → submitted → paid reservation fee), visitors by source, and most
  viewed cars with view → booked. Tag links with `?fb` (`?fb=<post>` names it), `?ig`, `?tt`,
  `?src=` or `utm_source`; Facebook's `fbclid` and referrers count too. A visitor keeps their
  last non-direct source for 30 days. Events live in `site_events` (anonymous first-party
  cookie ids, no IP or user agent stored; bots and owner/admin/staff accounts skipped) —
  see `20261013090000_site_events.sql`.

Metric definitions live in `20260929103000_analytics_rpcs.sql` and `README.md` §Analytics.
Cancellations capture a structured reason (`rentals.cancellation_reason`).

---

## 5.9 Finance (owner only)

`/finance` — a BIR-oriented statement for the accountant. A reporting aid feeding registered
books, not the books themselves. Design and rationale: `FINANCIAL_STATEMENT_PLAN.md`.

- **Overview** (`/finance`, the default): income − expenses = profit, both net of VAT, by month,
  by expense type and by car. Depreciation and VAT are explained beside it, not folded in.
- **Accountant report** (`/finance/report`) for a fiscal month, quarter, year, year to date or custom dates: gross receipts
  (cash basis, VAT split), income statement, expenses by BIR itemized-deduction line,
  depreciation schedule, profit by vehicle, tax worksheet (2550Q or 2551Q, 2307 credits, EWT
  owed, income tax under every election) and an exceptions block. Every figure drills down to its
  rows; every schedule exports as CSV; the page prints cleanly.
- **Expenses** (`/finance/expenses`): BIR line, optional vehicle, supplier and TIN, document,
  input VAT, expanded withholding. Voided, never deleted.
- **Fixed assets** (`/finance/assets`): the register depreciation is computed from.
- **2307 certificates** (`/finance/withholding`): tax clients withheld, pending or received.
- **Tax settings** (`/finance/settings`): registration, VAT status, election and every rate.

Payments are stamped with a VAT treatment when written (`payments.vat_treatment`), from the
settings in force then. After registering for VAT, re-stamp past payments from Tax settings.

---

## 6. Database Schema

Use UUID primary keys and `timestamptz`. Tables in this scope:

```text
company_profile
profiles
vehicles
vehicle_photos
customers
rentals
rental_payments
inspections
app_settings
```

Tracking tables (`gps_devices`, `vehicle_latest_locations`, `vehicle_location_history`,
`geofences`, `vehicle_geofences`, `rental_geofences`, `tracking_events`,
`integration_sync_logs`) belong to `GPS_TRACKING_FEATURES.md`. Where they already exist,
leave them; do not add columns to them in this scope.

### Constraints

- Unique active plate number across the fleet.
- Prevent overlapping reserved/active rentals for the same vehicle.
- Rental references are unique.

---

## 7. Supabase Security Requirements

- Enable Row Level Security on all business tables.
- Access is decided by `profiles.role` through RLS.
- Public booking reads go through a narrow, explicitly public surface (available vehicles
  only) — never a blanket anon-select on `vehicles`.
- Rental staff cannot manage users or org settings.
- Never expose the Supabase service-role key in the browser.
- Secrets are stored in server-side environment variables only.
- Audit sensitive actions such as role changes and rental cancellations.

---

## 8. Pages

### Public
- `/` (landing)
- `/book`
- `/book/[vehicleId]`
- `/book/confirmation`
- `/login`
- `/forgot-password`
- `/reset-password`
- `/access-disabled`

### Customer
- `/account`
- `/account/bookings`

### Protected (owner/admin)
- `/dashboard`
- `/vehicles`
- `/vehicles/new`
- `/vehicles/[id]`
- `/customers`
- `/customers/new`
- `/customers/[id]`
- `/rentals`
- `/rentals/new`
- `/rentals/[id]`
- `/reports`
- `/analytics`
- `/finance` (owner only), `/finance/report`, `/finance/expenses`, `/finance/assets`,
  `/finance/withholding`, `/finance/settings`
- `/settings`
- `/settings/users`
- `/settings/charge-types`

Pages owned by the parked tracking scope (`/map`, `/devices`, `/geofences`, `/alerts`,
`/vehicles/[id]/tracking`, `/settings/integrations`) are listed in `GPS_TRACKING_FEATURES.md`.

---

## 9. UI and UX Requirements

- Responsive desktop-first ops dashboard; must remain usable on tablets and mobile browsers.
- Public booking is mobile-first — most customers arrive on a phone.
- Clear loading, empty, stale, error, and offline states.
- Use skeleton loaders for dashboard cards and lists.
- Confirm destructive actions.
- Use accessible form labels and keyboard navigation.
- Do not use color as the only status indicator.
- Consistent units: distance in kilometers, currency in PHP, Philippine date/time display while
  storing timestamps in UTC (`Asia/Manila`).
- Component choices follow the UI conventions in `AGENTS.md` and `NEXTJS-AGENT.md` §2
  (shadcn first, `DataTable` stack for resource lists, `Empty` primitive for empty states).

---

## 10. Non-Functional Requirements

### Performance
- Dashboard should load within a few seconds for a small fleet.
- Paginate rental and customer tables server-side.
- Index vehicle, customer, rental, date-range, and status columns.

### Reliability
- Availability and overlap checks are enforced in the database, not only in the UI.
- Failed actions surface a retryable error — no silent failures.

### Testing
- Unit tests for rental rules, availability/overlap, and pricing.
- Integration tests for Supabase data access.
- Tests for RLS policies where possible.
- End-to-end test for: login → create vehicle → create customer → create booking → start
  rental → complete rental.

---

## 11. Out of Scope

Not in this build:

- **All GPS tracking** — devices, live map, route history, geofences, tracking alerts,
  Traccar integration, simulator. See `GPS_TRACKING_FEATURES.md`.
- Online payments and full accounting. `/finance` is a reporting aid for the accountant, not the
  registered books of accounts (no CAS, no serially numbered invoices).
- Automated Facebook identity verification, AI scam detection, facial recognition.
- Remote engine shutdown, OBD diagnostics, fuel sensor integration.
- Maintenance inventory.
- Complex dynamic pricing.
- Multi-branch accounting.
- Native mobile apps.
- Public renter live-tracking links.

Design the codebase so tracking can be added back later without reworking the rental domain.

---

## 12. Build Milestones

### Milestone 1: Foundation
- Next.js + TypeScript, Tailwind, shadcn/ui.
- Supabase configured.
- Authentication, profiles, roles, RLS.
- Navigation and protected layout.

### Milestone 2: Rental core
- Vehicle CRUD + photo gallery.
- Customer CRUD.
- Rental CRUD.
- Rental status rules and overlap prevention.
- Server-side search, filters, and pagination.

### Milestone 3: Public booking
- Landing and availability search.
- Public fleet listing and vehicle detail.
- Signed-in booking submission (no guest booking).
- Confirmation and owner notification.

### Milestone 4: Rental operations polish
- Inspections at pickup and return.
- Payments/proof capture.
- Overdue detection and due-today views.
- Customer account bookings view.

### Milestone 5: Reports and hardening
- Rental reports and CSV export.
- Performance indexes.
- Validation and error handling.
- RLS review.
- Automated tests.
- Deployment documentation.

Tracking milestones (T1–T4) live in `GPS_TRACKING_FEATURES.md` and start only after this list
is stable and in daily use.

---

## 13. Definition of Done

The rental core is complete when:

**Ops** can sign in, register a customer, register a vehicle with photos and a daily rate,
create a reservation without double-booking, start the rental, record pickup condition,
complete the rental with return condition and odometer, see overdue rentals surface
automatically, and export a rental report.

**A customer** can open the public site, search dates, see only genuinely available vehicles,
open a vehicle, sign in and submit a booking, and receive a confirmation — with
the booking appearing in the ops rentals list.

---

## 14. Implementation Rules

1. Build milestone by milestone. Do not attempt the entire application in one unreviewed change.
2. Before editing, inspect the existing repository and summarize the current architecture.
3. Follow `NEXTJS-AGENT.md` for folder structure and layer boundaries.
4. Use TypeScript strict mode.
5. Keep server-only credentials out of client components.
6. Generate Supabase migrations instead of manually editing production tables.
7. Add RLS policies in migrations.
8. Reuse validation schemas between forms and server actions.
9. Keep data access in each feature's `services/`; keep business rules in `lib/` with tests.
10. Add meaningful error states instead of silent failures.
11. Run formatting, type checking, linting, and tests after each milestone (`npm run check`).
12. Do not remove working features without explicit approval.
13. Document environment variables and setup commands.
14. When requirements are unclear, use the simplest implementation that preserves future
    extensibility.
15. **Do not add GPS/tracking scope.** If a task seems to need it, stop and confirm first.

---

## 15. Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SITE_URL=
SUPABASE_SERVICE_ROLE_KEY=

TELEGRAM_BOT_TOKEN=
TELEGRAM_OWNER_CHAT_ID=

DEFAULT_TIMEZONE=Asia/Manila
```

Tracking-related variables (`GPS_PROVIDER`, `TRACCAR_*`, tracker thresholds,
`LOCATION_RETENTION_DAYS`) are listed in `GPS_TRACKING_FEATURES.md` and stay unset while that
scope is parked.

Do not expose variables without the `NEXT_PUBLIC_` prefix to browser code.
