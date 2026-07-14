# City Rentals

Car-rental operations and GPS fleet tracking built with Next.js 16, TypeScript, Tailwind CSS, shadcn/ui, TanStack Table, and Supabase.

## Current milestone

Milestone 1 provides the reusable design system, responsive protected shell, authentication and password recovery flows, organization/profile RLS migration, simulator-ready dashboard, and internal component preview at `/design-system`.

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
- `npm run typecheck`
- `npm test`
- `npm run build`

## Security notes

- Use a Supabase publishable key in the browser; never expose `SUPABASE_SERVICE_ROLE_KEY`.
- Server-side route protection validates JWT claims rather than trusting session storage.
- Authorization roles live in `public.profiles`, not user-editable metadata.
- All exposed business tables use RLS and explicit grants.
# citi-rental
