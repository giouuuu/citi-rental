# Next.js App — Agent Architecture Rules (this repo)

Architecture rules for this car-rental codebase. The folder structure and paths below describe
the **actual repo layout** — features are flat (`actions/` · `components/` · `lib/` · `schemas/`
· `services/` · `types/`), shared UI lives at the repo root in `components/`, and there is no DI
container. Do not introduce numbered clean-architecture layers (`0_data/`, `1_domain/`,
`2_presentation/`) — they are not used here.

The stack at a glance:

| Concern           | This repo                                                                          |
| ----------------- | ---------------------------------------------------------------------------------- |
| Routing           | App Router (`app/`) + `proxy.ts` guard                                              |
| State             | Server Components + Server Actions; `react-hook-form` + local React state on client |
| DI                | none — server code imports the Supabase client factories from `lib/supabase/`       |
| Theme tokens      | Tailwind v4 `@theme` tokens in `app/globals.css`                                    |
| Shared primitives | `components/ui/` (shadcn/ui) + `components/` composites                             |
| Validation        | `zod` schemas in each feature's `schemas/`                                          |
| Version file      | `package.json`                                                                      |

> **Version discipline.** This project is on a Next.js major whose APIs may differ from your
> training data. Read the version-matched docs in `node_modules/next/dist/docs/` before writing
> code that touches a framework API. §15 lists the version-specific rules that currently apply.

---

## 1. Brand & Theming (read before styling anything)

Every project has **one design source of truth** — a brand/design doc plus a token file:

- Brand doc: `DESIGN_SYSTEM.md` — palette, typography, spacing, component tone.
- Token code: `app/globals.css` — the Tailwind v4 `@theme` block (colors, fonts, radii,
  spacing) plus the shadcn/ui semantic variables (`--background`, `--primary`, `--muted`, …).
- Fonts: loaded once via `next/font` in `app/layout.tsx` and exposed as `--font-*` variables.

Non-negotiables:

- **Never hardcode raw hex/rgb in components.** No `text-[#33544A]`, no `style={{ color: ... }}`,
  no arbitrary-value color classes. Use semantic token classes (`bg-primary`, `text-muted-foreground`,
  `border-border`) that resolve through `@theme`.
- `app/globals.css` is the **only** file in the codebase allowed to contain color literals.
- Accent/pastel fills are **surfaces only** unless the brand doc says otherwise — never use a
  fill color as text/icon color on a light surface without a documented contrast check.
- **One primary action per screen** — one filled primary button; everything else is secondary,
  outline, or ghost.
- No inline font families or one-off `text-[13.5px]` sizes in feature components — the type
  scale lives in `@theme` and is applied through utility classes or a `<Text>` primitive.
- Light/dark: if the app supports both, every token resolves through the CSS variable layer
  (`:root` / `.dark`), never `dark:` conditionals scattered across feature components.
- Recreate approved designs/prototypes faithfully, but **do not build presenter chrome**
  (browser frames, demo rails) — those are presentation-only artifacts.

---

## 2. Component Build Order (reuse-first) — mandatory

Before building or hand-rolling **any** UI component, work down this list and stop at the first hit:

1. **Reuse** — list `components/ui/` and `components/` and check what is _actually
   there_. Do not trust this document for the inventory: it drifts. If it fits, use it.
2. **Add the shadcn/ui primitive** — `npx shadcn@latest add @shadcn/<component>`. This is the
   framework-built-in tier: the component lands in `components/ui/`, owned by us, and is
   then re-skinned via tokens. Prefer this over a custom re-implementation of a dialog,
   select, table, popover, or command palette.

   **Standing authorization: install it yourself, without asking.** When a registry component
   covers the need, run `add` and use it — no permission request, no "should I?". This is a
   pre-approved action, not a judgement call. Report which components landed and which npm
   dependencies came with them, since tier 3's disclosure rule still applies to those.

   **Check the registry before concluding a component does not exist** —
   `npx shadcn@latest search @shadcn -q <term>`, or the shadcn MCP server if available.
   "shadcn does not have one" is a claim to verify, not assume.

   **This project uses the `radix-nova` style** — set in `components.json`. After any `add`,
   confirm the file actually appeared in `components/ui/` before building on it.

3. **Well-maintained npm package** — only for genuinely hard problems (calendars, charts,
   rich text, virtualized grids, date math). Prefer packages already in `package.json`;
   adding a new dependency requires saying so explicitly.
4. **Hand-roll only as a last resort** — and say so explicitly when you do.

Then, always:

- **Re-skin to brand.** shadcn and npm components ship neutral defaults — never ship them
  as-is. Style by editing the primitive in `components/ui/` (token classes + `cva`
  variants), not by sprinkling overrides at call sites.
- **Place by scope.** Cross-feature primitives → `components/ui/`; cross-feature composites
  → `components/` (e.g. `app-shell/`, `data-table/`, `landing/`); feature-specific components
  → that feature's `src/features/<feature>/components/`.
- **Server by default.** A component is a Server Component unless it needs state, effects,
  browser APIs, or event handlers. Add `'use client'` at the leaf that needs it, never at a
  page or layout to "make imports work".
- Keep the architecture gates (§4): no business logic or direct data access in components.

Do not substitute a hand-rolled fragment for a registry primitive that already covers the case
— e.g. `components/ui/field.tsx` (installed) exports `FieldError` outright; never hand-write an
error paragraph beside it. A custom composite is still fine — give it a name that is not a
stock primitive's (`data-table`, `resource-table`, `empty-state` all pass today).

---

## 3. Canonical Feature Structure (mandatory)

This is the feature structure used across this repo. **All new features and any feature you
touch must follow it.**

```
src/
  features/
    <feature_name>/            # alerts, auth, booking, customers, dashboard, devices,
                               # geofences, inspections, rentals, reports, settings,
                               # shared, tracking, users, vehicles
      actions/                 # 'use server' Server Actions — the mutation entry points
      components/              # components scoped to this feature (screens included)
      hooks/                   # feature-scoped React hooks (only where needed)
      lib/                     # pure helpers + business rules; unit tests colocated (*.test.ts)
      schemas/                 # zod schemas + resource definitions
      services/                # server-only data access (Supabase queries) — `import 'server-only'`
      types/                   # plain serializable TS types for the feature
      index.ts                 # barrel — the feature's public API
```

### Rules

1. Features are **flat** — no numbered layers (`0_data/`, `1_domain/`, `2_presentation/`), no
   `data/domain/presentation` nesting. Files go directly into the folders above.
2. Only create the folders a feature needs — `customers/` is just `actions/` + `schemas/`;
   `vehicles/` uses the full set. Do not scaffold empty folders.
3. Every feature exposes its public surface through `index.ts`. Other features and `app/`
   routes import via the barrel (`@/features/vehicles`), not deep paths into another feature.
4. Reuse shared types and helpers instead of inventing near-duplicate ones.
5. `features/shared/` is reserved for truly cross-feature code only (role helpers
   `lib/app-roles.ts`, resource screens/tables, form utilities, shared types).

### Folder Responsibilities

1. `services/` — the only place a feature runs queries. **Server-only**: every module starts
   with `import 'server-only'`, creates its Supabase client per call via
   `createClient()` from `@/lib/supabase/server`, and maps DB rows to the feature's `types/`.
   No React, no JSX.
2. `actions/` — `'use server'` mutation entry points. An action parses input with a schema from
   `schemas/`, performs the mutation (via services/lib), and returns a serializable result. No
   business policy inline.
3. `lib/` — helpers and business rules (pricing, date ranges, galleries, role checks). Keep
   them pure and framework-free where possible so they stay unit-testable; tests are colocated
   as `*.test.ts`.
4. `schemas/` — `zod` schemas and resource definitions consumed by both forms and actions.
5. `types/` — plain serializable TS types. No DB row shapes leaking out of `services/`.
6. `components/` — the feature's UI, including its route-level screens. **No queries, no
   business rules** — server components call services, client components call actions.

### Types must be serializable

Feature types cross the server → client boundary through React's serialization. So:

- Types are **plain object types** (`type PublicFleetVehicle = { … }`), not classes with
  methods. A class instance cannot be passed from a Server Component to a Client Component.
- Behavior that would be a method lives as a **pure function** in the feature's `lib/`
  (`isCancellable(booking): boolean`).
- Allowed field types: primitives, `Date`, arrays, plain objects, `null`. No functions, no
  `Map`/`Set` in types that reach the client, no DB row types leaking through.

### File Naming Conventions

- Files: `kebab-case.ts` / `kebab-case.tsx` · Types & components: `PascalCase` · functions: `camelCase`.
- Services: verb-first `list-xxx.ts` / `get-xxx.ts` · Actions: `xxx-action.ts` (e.g.
  `save-vehicle-action.ts`, `archive-vehicle-action.ts`) · Hooks: `use-xxx.ts`
- Schemas: `xxx-definition.ts` for resource definitions, `xxx-schema.ts` otherwise.
- One exported component per file; the file name matches the component.

### Where the rest of the code lives

```
app/                           # ROUTES ONLY — see "Routing" below
  layout.tsx                   # root shell: fonts, providers, <html>/<body>
  globals.css                  # Tailwind v4 @theme tokens (see §1)
  (auth)/                      # login, register, forgot/reset password, access-disabled
  (protected)/                 # ops app — owner/admin only (dashboard, vehicles, rentals, …)
  @modal/                      # intercepted routes: (.)book, (.)login
  book/ · account/ · auth/     # public booking flow, customer account, auth callback
proxy.ts                       # request-level guard (see "Routing")
components/                    # shared UI at the repo root
  ui/                          # shadcn/ui primitives — cross-feature, brand-skinned
  app-shell/ · data-table/     # shared composites
  auth/ · brand/ · landing/    # shared composites
hooks/                         # shared client hooks (use-mobile.ts)
lib/                           # shared non-UI code
  supabase/                    # client factories: server.ts, client.ts, env.ts, proxy.ts
  fleet/                       # cross-feature domain helpers (tracker-status.ts + test)
  navigation.ts                # ops sidebar navigation groups
  utils.ts                     # cn() and tiny helpers
supabase/                      # Supabase CLI project: config.toml, migrations/
scripts/                       # one-off maintenance scripts
src/features/                  # see canonical structure above
```

Path aliases (`tsconfig.json`): `@/features/*` → `src/features/*`; `@/*` → repo root
(`@/components/ui/button`, `@/lib/supabase/server`, `@/hooks/use-mobile`).

Reusable UI atoms stay in `components/ui/`. Feature-specific UI stays inside that feature's
`components/` folder under `src/features/`.

### Routing — App Router (mandatory)

**The `app/` directory holds routing artifacts only.** Never put feature logic or substantial
markup in a `page.tsx`.

1. A `page.tsx` is a **thin shell**: read params, then render exactly one screen component
   imported from a feature barrel. Target ≤ 20 lines.

   ```tsx
   // app/(protected)/vehicles/page.tsx
   import { vehicleDefinition } from "@/features/vehicles";
   import { ResourceIndexScreen } from "@/features/shared";

   export default function Page({
     searchParams,
   }: {
     searchParams: Promise<Record<string, string | string[] | undefined>>;
   }) {
     return (
       <ResourceIndexScreen
         definition={vehicleDefinition}
         searchParams={searchParams}
       />
     );
   }
   ```

2. `params` and `searchParams` are **Promises** — always `await` them (§15).
3. Ops sidebar destinations live in `lib/navigation.ts` (`navigationGroups`); do not duplicate
   nav structures per component.
4. Navigate with `<Link>` / `useRouter()`; server-side redirects use `redirect()` from
   `next/navigation`.
5. Auth/role gating is **two-layered and both layers are required**:
   - an optimistic check in `proxy.ts` (cheap redirect for unauthenticated traffic), and
   - an authoritative check on the server — `app/(protected)` is owner/admin only via
     `profiles.role` (`ADMIN_ROLES` / `isAdminRole` from `@/features/shared`) plus RLS/RPCs.
     Never authorize from JWT `user_metadata`. Proxy alone is **never** the authorization
     boundary.
6. Use route groups `(protected)`, `(auth)` for shells, `@modal` intercepted routes for
   overlay flows, `loading.tsx` for suspense fallbacks, `error.tsx` for boundaries, and
   `not-found.tsx`. `error.tsx` and `not-found.tsx` are **one per shell, not per page**.
   `loading.tsx` is **per route family**: a dynamic page is only prefetched if it has one
   (`02-guides/prefetching.md`), so a single shell-level fallback blocks partial prefetching
   for every route under it — and a shell skeleton shaped like one page flashes a layout the
   others never render. Keep each route's `loading.tsx` a thin re-export of a shared skeleton
   component (e.g. `ResourceListSkeleton`) so the markup stays single-sourced.
7. Every dynamic screen loads its own data from the id in the URL — never pass whole entities
   through client-side navigation state (deep links and refreshes must work).

---

## 4. Always-On Architecture Rule

For every task, without exception, respect the feature-folder boundaries:

1. Data access lives in `services/` (server-only); mutations enter through `actions/`;
   business rules live in `lib/`; UI lives in `components/`.
2. Client components never reach the database — they receive data as props from server
   components or call a Server Action.
3. Keep single responsibility per file/component/service.
4. Keep business policy and workflow logic out of components and actions — put it in the
   feature's `lib/` as pure, tested functions.
5. Reject changes that violate these rules, even if the code compiles.

### Presentation Thinness Rules

1. Screens are composition-only — call services (server) or hold local UI state (client),
   compose components, dispatch intents. No queries inline, no persistence.
2. **Server Actions are adapters, not logic.** An action does exactly four things: parse input
   with a zod schema from the feature's `schemas/`, perform the operation via `services/` and
   `lib/`, and map the result to a serializable `{ ok, data | error }`. It must not contain
   pricing/eligibility/transition rules.
3. **Client state stays local** — dialog open flags, selected rows, filter drafts, wizard step
   live in React state / `react-hook-form`. Never mirror server data into client state; if a
   client component genuinely needs fresh data, it calls an action and lets
   `revalidateTag`/`updateTag` refresh the tree (§15).
4. Every meaningful component lives in its own file.
5. Target max file size: **300 LOC** for component files (`.tsx`). Split before you exceed it.

### Mandatory Compliance Gates

1. Every `services/` module begins with `import 'server-only'` — no `'use client'`, no JSX.
2. No `'use client'` module imports from a feature's `services/` (directly or via barrel-only
   re-exports) — client code gets data as props or through an action.
3. Business policies and decision matrices (availability, status transitions, pricing, rate
   locks) live in the feature's `lib/` with colocated `*.test.ts` — never inline in components
   or actions.
4. Sensitive mutations (payments, role/status changes) never trust client-supplied values —
   the server re-validates and re-computes; the client displays what the server returns.
5. Supabase env parsing goes through `lib/supabase/env.ts` (`isSupabaseConfigured`); other
   `process.env` reads happen only in server-only modules, never in client components.
6. Cross-feature imports go through the feature barrel (`@/features/<name>`), never deep paths
   into another feature's internals.
7. Any task that introduces or preserves a gate violation is considered incomplete.

Required validation before finishing presentation work — see §10 for the full command block.

---

## 5. Data Access Wiring (no DI container)

This repo uses **no DI framework and no composition root** — wiring is direct imports:

```
lib/supabase/
  server.ts        # createClient() — request-bound server client (cookies, RLS applies)
  client.ts        # browser client for client components
  env.ts           # env parsing + isSupabaseConfigured()
  proxy.ts         # session refresh used by the root proxy.ts guard
```

```ts
// src/features/vehicles/services/list-vehicle-photos.ts
import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
```

Rules:

1. `services/` modules create their Supabase client **per call** via `createClient()` — never a
   module-level singleton client.
2. Query code lives only in `services/` (and `actions/` for their own mutations) — never in
   components, hooks, or `app/` routes.
3. A service guards on `isSupabaseConfigured()` and returns a safe fallback (empty list, null)
   when the environment is not configured, instead of throwing at import time.
4. Client components never import `@/lib/supabase/server` or a `services/` module — they
   receive data as props or call a Server Action.

---

## 6. Data Provider Rules

Supabase is the single data provider. Rules:

1. Secrets (API tokens, e.g. Telegram/Traccar) come from server-only env vars, are never
   committed, never prefixed `NEXT_PUBLIC_`, and never appear in client components. Only the
   Supabase URL and publishable key are `NEXT_PUBLIC_`.
2. Supabase clients are created per request in `lib/supabase/` — a server client bound to the
   request cookies for user-scoped reads (RLS applies), and a browser client for client
   components.
3. Row Level Security is part of the contract, not a replacement for it: services and actions
   still authorize explicitly via `profiles.role` (§3 Routing rule 5).
4. Third-party money APIs have **no mock that calls live endpoints** — in demo/test paths,
   simulate success/failure locally and never touch the real API.

---

## 7. Domain Constraints (template — fill per project)

Encode every business rule below as a pure function in a feature's `lib/`, never as component
logic.

### Status state machines

- Every stateful entity (booking, order, membership, …) gets an explicit transition table in
  this file, e.g.:

  ```
  pending     → confirmed | cancelled
  confirmed   → in_progress | cancelled | no_show
  in_progress → completed
  ```

- Transitions execute only through their dedicated action, which validates the current state
  via a `lib/` rule. Disabling a button is a hint; the server (and the database) re-validate.
- This repo's rental machine: `draft → reserved → active → completed/cancelled`, with booking
  gates on each transition. `vehicles.status` is operational only
  (`available`/`maintenance`/`inactive`); day-level reservation state derives from rental date
  ranges, never from tagging the vehicle row.

### Roles & permissions

- Role/status mutations are privileged-only and go through a dedicated action that checks
  `profiles.role` (`isAdminRole`) — never ad-hoc mutations. A restricted user may still sign
  in and browse unless the spec says otherwise.

### Records with history

- Never hard-delete entities referenced by history — soft-archive (`status = 'archived'`)
  and preserve records.

### Server-authoritative values

- Totals, fees, points, queue numbers, and anything money- or fairness-related are computed
  on the server. The client displays; it never sets them.

### Time & money

- Declare the app's canonical timezone here: `Asia/Manila`. All date math goes through a shared
  helper with the timezone explicit; persisted timestamps are UTC; presentation formats to the
  canonical zone. Never format a server-rendered date with the machine's local zone implicitly.
- Never do float math on money — keep money math in a shared helper (`features/shared/lib/` or
  `lib/`), not scattered across components.

### Open items

- When a business rule is flagged as unconfirmed by the client (tiers, pricing, thresholds),
  keep it in a named policy object in the feature's `lib/` with a comment — never scatter
  placeholder numbers across the UI.

---

## 8. Versioning

After every change — including documentation-only edits — update `version` in `package.json`:

- **Patch** (`0.0.x`) — bug fixes, copy/style tweaks, refactors with no behavior change
- **Minor** (`0.x.0`) — new features, new screens, new services/actions, or additive changes
- **Major** (`x.0.0`) — breaking changes to domain contracts, auth flows, or data schemas

Rules:

- Always increment; never leave the version unchanged after a task.
- Apply the highest applicable bump when a single task touches multiple change types.
- Do not hardcode visible version strings in components — expose the value once through a
  shared server module (e.g. a build-time env var) and read it from there.

---

## 9. Non-Negotiable Operating Rules

1. Read target files immediately before editing them.
2. Read the version-matched Next.js docs in `node_modules/next/dist/docs/` before using a
   framework API you have not verified in this codebase.
3. Edit only the smallest safe scope required to satisfy the task.
4. Never import a feature's `services/` (or `@/lib/supabase/server`) from a `'use client'`
   module.
5. Keep business rules in `lib/` pure and unit-testable — no React, no `next/*` in a rule
   helper.
6. Guard on `isSupabaseConfigured()` inside services — never scatter env branching across
   feature code.
7. Sensitive mutations never trust client-supplied values — the server re-validates.
8. Keep policy/business rules out of components and actions; place them in the feature's
   `lib/`.
9. `'use client'` goes on the smallest leaf that needs it — never on a page, layout, or screen
   to make an import resolve.
10. Validate every completed change with command output before claiming completion.
11. Increment `package.json` version after every task, including documentation-only changes.
12. If unexpected non-user edits appear in unrelated files during work, stop and ask for
    direction.
13. Treat screens as composition-only; move heavy UI into feature components and logic into
    the feature's `lib/`.
14. **Every consequential action must confirm before executing** — sign out, cancel, refund,
    archive, delete, role/status change. Never fire immediately on click; use the shared
    `components/ui/alert-dialog.tsx`, with a destructive tone where appropriate.

---

## 10. Required Validation Checklist

Before closing any task that touches presentation or routing:

```bash
npm run check                                      # lint + typecheck + vitest — must pass
npm run build                                      # catches server/client boundary errors
```

**Layer gates.** Gates 1–4 must return **nothing**; gate 1 lists any `services/` module
missing its `server-only` guard. Gate 5 is a size report, not a pass/fail.

```bash
# 1 — every services module carries the server-only guard (lists offenders)
find src/features -path "*/services/*" -name "*.ts" -exec grep -L "server-only" {} +

# 2 — no client directives or JSX in services
grep -rn "use client" src/features | grep "/services/"
find src/features -path "*/services/*" -name "*.tsx"

# 3 — the server Supabase client never reaches client modules
grep -rln "use client" src/features components app --include="*.tsx" --include="*.ts" \
  | xargs grep -ln "@/lib/supabase/server" 2>/dev/null

# 4 — secrets are never exposed to the browser
grep -rEn "NEXT_PUBLIC_[A-Z_]*(SECRET|SERVICE_ROLE|PRIVATE|TOKEN)" src app components lib
# Server-only secrets (Telegram bot token, Traccar credentials) are read in
# server-only modules only — matches the READ, not the name.
grep -rEn "process\.env\.(TELEGRAM_BOT_TOKEN|TELEGRAM_OWNER_CHAT_ID|TRACCAR_API_TOKEN|TRACCAR_USERNAME|SUPABASE_SERVICE_ROLE_KEY)" components hooks app/@modal
# No literal key value anywhere, ever.
grep -rEn "sb_secret_|sb_publishable_[A-Za-z0-9_-]{10,}|eyJ[A-Za-z0-9_-]{30,}" src app components lib proxy.ts

# 5 — size report for component files (split anything over 300 LOC)
find src/features components -name "*.tsx" -exec wc -l {} + | sort -nr | head -n 30
```

> Written glob-free on purpose: under `zsh` an unmatched glob like `src/features/*/services`
> aborts the whole command, and `grep $(find …)` with no matches blocks reading stdin. Use
> these forms as-is rather than "tidying" them into globs.

---

## 11. Definition Of Task Completion

A task is complete only when all conditions are true:

1. Code edits are applied and correct.
2. Required validation commands pass for the changed scope.
3. `package.json` version is incremented.
4. Reported outcomes are command-verified, not assumed.

---

## 12. UX & Information Architecture Conventions

Default to good UX and established best practice; never crowd a screen with everything at once.

1. **Account vs Settings.** The Account/Profile screen holds personal identity only (name,
   avatar, phone, read-only email). Security (password), preferences (theme/notifications),
   and danger-zone actions belong on a **Settings** screen.
2. **Secondary content stays collapsed.** History/archived content goes behind a collapsible
   section — collapsed by default, omitted when empty. Primary/active content shows first.
3. **Consequential actions always confirm via a dialog** (§9.14).
4. **One fused list over parallel lists** when entries differ only by kind — a single list
   with a per-row type indicator, not two side-by-side lists.
5. **Reuse the shared primitives** in `components/ui/` instead of re-implementing patterns
   per screen, so all surfaces stay consistent.
6. **Consistent interaction grammar:** single-select segmented/chip patterns for dates, times,
   and filters with the brand's selected style; subtle entrance transitions; sticky footer
   action bar on long forms; conditional panels render only when their option is selected.
7. **Every async action shows state:** pending (disabled control + inline spinner), success
   (toast), and error (inline field errors plus a retryable message). No silent failures, no
   double-submits. Read pending from `formState.isSubmitting` inside a react-hook-form form,
   and from `useActionState` / `useFormStatus` for an action invoked outside one (a row action,
   a confirm-dialog button).
8. **Streaming over spinners-on-everything.** Use `loading.tsx` and `<Suspense>` boundaries so
   the shell paints immediately; never block a whole page on the slowest panel.
9. **Forms — `react-hook-form` + `Field`, one schema, two consumers.** The canonical shape:

   - `useForm({ resolver: zodResolver(schema) })` with the **same** schema the action parses.
     Client validation is UX; the action's parse is the contract.
   - `<Controller />` per input, rendering the `@shadcn/field` primitives (`Field`,
     `FieldLabel`, `FieldError`, `FieldDescription`). Put `data-invalid` on `Field` and
     `aria-invalid` on the control. Never hand-roll an error paragraph.
   - Submit with `onSubmit={form.handleSubmit(...)}` and call the action as a plain typed
     async function — not `<form action={…}>`. These forms require JS, which is a deliberate
     trade for an authenticated admin surface.
   - **A form carrying a file builds its `FormData` from the submitted values via
     `valuesToFormData`** (`features/shared/lib/form-utils.ts`), never with
     `new FormData(form)` inside the submit callback. `handleSubmit` flips `isSubmitting` and
     React flushes the re-render _before_ the callback runs, so a `new FormData(form)` built
     there silently omits every control disabled by `disabled={isSubmitting}` — HTML's
     entry-list construction skips disabled fields. For a file input that reads as
     "unchanged", not as an error: the row saves, the toast says success, and the upload
     never happens.
   - Server actions take `values: unknown` and let the schema parse. **Never** widen that to
     the inferred `…Values` type: a typed parameter is not a runtime guarantee, and a
     hand-rolled POST would then skip validation entirely.
   - Feed a rejected action back with `applyServerFieldErrors(form, result)`
     (`features/shared/lib/form-utils.ts`) — per-field issues onto their fields, form-level
     onto `root`.

   Reference implementation: `src/features/auth/components/register-form.tsx`.

---

## 13. Long Lists & Data-Heavy Screens (mandatory pattern)

Every long or admin-style list is built on the project `DataTable` stack —
`components/data-table/` plus the resource-table components in
`src/features/shared/components/` (`resource-table*`, `resource-index-screen`). Never
hand-roll pagination, its search, or its loading states. Reference implementation:
`src/features/shared/components/resource-index-screen.tsx`.

1. **Server-side pagination via URL state.** Page/size/sort/filters live in `searchParams`, so
   every list view is linkable, refresh-safe, and back-button correct. The screen awaits
   `searchParams`, passes them to a service with `{ offset, limit, sort, filters }`, and
   renders the returned page. Never load the whole table and paginate in the browser.
2. **Search — debounced, server-side.** The search field updates the URL (300 ms debounce,
   `router.replace` with `scroll: false`) and the server re-queries case-insensitively. Never
   ship a list where search silently sees only the current page.
3. **Loading indication.** Use `useTransition`'s pending flag (or a `loading.tsx` boundary) to
   show a linear progress indicator that never shifts the rows — overlay or reserved slot.
   Keep the previous page visible while the next one loads; do not flash a skeleton on every
   keystroke.
4. **Empty states.** Zero rows and no active filter → the shadcn `Empty` primitive
   (`components/ui/empty.tsx`) with one primary CTA.
   A search or filter with no hits → a specific "No `<items>` match your search." message that
   names the active filter window and offers a clear-filters action.
5. **Filters beyond search** live in a bar above the table, built from shared primitives
   (combobox, date-range picker). Filters auto-apply on change — no "Apply" button; date ranges
   apply on commit (picker close), not on first day click. The active filter window is always
   visible in copy (e.g. "Showing: Jul 21 onward").
6. **Row actions** open a menu, and any destructive item routes through the shared alert
   dialog (§9.14). Bulk actions state the count in the confirmation ("Archive 12 vehicles?").

---

## 14. Behavioral Guidelines

Behavioral guidelines to reduce common LLM coding mistakes. For trivial tasks, use judgment.

### 14.1 Think Before Coding

Don't assume; don't hide confusion; surface tradeoffs. State assumptions explicitly and ask
when uncertain. Present multiple interpretations rather than silently picking one. Say so when
a simpler approach exists. When a client-flagged open item is in scope, name the assumption and
keep it configurable (§7 Open items).

### 14.2 Simplicity First

Minimum code that solves the problem. No speculative features, single-use abstractions,
unrequested "flexibility", or error handling for impossible scenarios. If 200 lines could be
50, rewrite. Ask: "Would a senior engineer say this is overcomplicated?"

### 14.3 Surgical Changes

Touch only what you must. Don't "improve" adjacent code, comments, or formatting; don't
refactor what isn't broken; match existing style. Remove only the imports/variables your own
change orphaned; mention unrelated dead code rather than deleting it. Every changed line should
trace to the request.

### 14.4 Goal-Driven Execution

Turn tasks into verifiable goals. For multi-step tasks, state a brief plan with a verify check
per step. Strong success criteria let you loop to done without constant clarification.

### 14.5 Don't Code From Memory On Framework APIs

Next.js changes fast and your training data lags it. Before using a routing, caching,
metadata, or image API you haven't already seen used in this repo, open the matching file under
`node_modules/next/dist/docs/` and confirm the current signature. Heed deprecation notices.

---

## 15. Framework Version Notes (Next.js 16 — verify against bundled docs)

These are the rules that differ from pre-16 patterns most agents were trained on. Re-check them
when the Next.js major changes.

1. **Async request APIs.** `params`, `searchParams`, `cookies()`, `headers()`, and `draftMode()`
   are Promises — `await` them. The synchronous compatibility shim from 15 is gone. Page props
   type as `{ params: Promise<{ id: string }> }`.
2. **Middleware is now Proxy.** The file is `proxy.ts` at the project root (sibling of `app/`),
   exporting `proxy()` (or a default export). `middleware.ts` is renamed, not just aliased.
3. **Turbopack is the default** for `next dev` and `next build`. Webpack config is ignored
   unless you opt out with `--webpack`. Don't add webpack config to solve a bundling problem.
4. **Caching.** With `cacheComponents: true`, cache via the `use cache` directive plus
   `cacheLife()` / `cacheTag()` — not ad-hoc `fetch` options. Without it, follow the previous
   model documented in `02-guides/caching-without-cache-components.md`.
5. **`revalidateTag(tag, profile)` takes two arguments** — the single-argument form is
   deprecated and errors in TypeScript. In a Server Action that needs read-your-writes
   (the user must see their change immediately), use `updateTag(tag)` instead.
6. **`next lint` was removed.** Lint through ESLint directly (`npm run lint` → `eslint`) with
   the flat config in `eslint.config.mjs`.
7. **Parallel routes require `default.js`** for every slot.
8. **`next/image`**: `images.domains` is deprecated (use `remotePatterns`), `next/legacy/image`
   is removed, and several defaults (`minimumCacheTTL`, `imageSizes`, `qualities`) changed.
9. **React 19.2** — `useEffectEvent`, `<Activity>`, and View Transitions are available;
   the React Compiler is supported and, when enabled, makes most manual `useMemo`/`useCallback`
   unnecessary — don't add them defensively.

---

## Appendix A — New-Feature Checklist

When adding a feature to this repo:

- [ ] Create `src/features/<feature_name>/` with only the folders it needs (§3) — no empty
      scaffolding, no numbered layers.
- [ ] Add `index.ts` and export the feature's public surface through it.
- [ ] `services/` modules start with `import 'server-only'` and use `createClient()` from
      `@/lib/supabase/server`.
- [ ] Actions parse with a schema from `schemas/`; business rules go in `lib/` with colocated
      `*.test.ts`.
- [ ] Routes in `app/` stay thin shells that render the feature's screen via its barrel.
- [ ] New shared UI goes through the §2 build order (reuse → shadcn add → npm → hand-roll).
- [ ] Run the §10 validation checklist and bump `package.json` version (§8).
- [ ] Re-check §15 against `node_modules/next/dist/docs/` when the Next.js major changes.
