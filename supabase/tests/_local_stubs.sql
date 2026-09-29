-- ===========================================================================
-- LOCAL-ONLY STUBS — applied by scripts/verify-migrations.sh BEFORE the real
-- migrations, as supabase_admin, inside a throwaway Docker container.
--
-- The bare `supabase/postgres` image ships the auth/storage schemas but not
-- the pieces that hosted Supabase (GoTrue / Storage API / platform hooks)
-- normally provide. These stubs fill exactly those gaps so every migration in
-- supabase/migrations applies unchanged. NEVER apply this file to a real
-- project.
-- ===========================================================================

-- --- auth: modern JWT helpers ----------------------------------------------
-- The image's auth.uid()/auth.email() only read the legacy
-- `request.jwt.claim.*` GUCs and auth.jwt() is missing. Mirror GoTrue's
-- current definitions so tests can impersonate with request.jwt.claims.
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.email()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

grant execute on function auth.jwt(), auth.uid(), auth.email(), auth.role()
  to public;

-- --- storage: minimal buckets/objects + foldername() ------------------------
create table if not exists storage.buckets (
  id text primary key,
  name text not null unique,
  owner uuid,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end
$$;

-- Hosted projects let `postgres` (the migration role) manage storage policies.
alter table storage.buckets owner to postgres;
alter table storage.objects owner to postgres;
grant usage on schema storage to postgres, anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects, storage.buckets
  to anon, authenticated, service_role;
grant execute on function storage.foldername(text) to public;

-- --- platform event-trigger helper referenced by an advisor-fix migration ---
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  return;
end
$$;
alter function public.rls_auto_enable() owner to postgres;
