-- Auto-provision a customer profile for first-time Google Auth users.
-- Attaches them to the existing public-listing organization (City Rentals
-- landing / show_on_public_site). Does NOT create a new organization.
--
-- Intentionally skipped for:
--   - Owner self-service signup (organization_name in user metadata → RPC)
--   - Email / invite identities (provider is not google)
--   - Users who already have a profiles row
--
-- Authorization never reads user_metadata; role is fixed to 'customer'.

create or replace function private.resolve_public_listing_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o.id
  from public.organizations o
  where o.is_active
    and o.show_on_public_site
  order by o.created_at asc
  limit 1
$$;

revoke all on function private.resolve_public_listing_organization_id()
  from public, anon, authenticated, service_role;

create or replace function private.handle_new_auth_user_customer_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider text;
  v_full_name text;
  v_organization_id uuid;
begin
  -- Already provisioned (e.g. race with RPC, or invite profile pre-linked).
  if exists (select 1 from public.profiles p where p.id = new.id) then
    return new;
  end if;

  -- Owner self-service registration sets organization_name and calls
  -- complete_self_service_registration after signup. Do not pre-create
  -- a customer row that would short-circuit that RPC.
  if nullif(btrim(coalesce(new.raw_user_meta_data ->> 'organization_name', '')), '')
    is not null
  then
    return new;
  end if;

  -- Staff invites and email/password signups stay manual / RPC-driven.
  -- Google booking customers are the only auto-provisioned path.
  v_provider := coalesce(
    nullif(btrim(coalesce(new.raw_app_meta_data ->> 'provider', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'provider', '')), '')
  );
  if v_provider is distinct from 'google' then
    return new;
  end if;

  v_organization_id := private.resolve_public_listing_organization_id();
  if v_organization_id is null then
    raise exception
      'No public-listing organization is available for customer signup.'
      using errcode = 'P0002';
  end if;

  v_full_name := left(
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Customer'
    ),
    120
  );
  if char_length(v_full_name) < 2 then
    v_full_name := 'Customer';
  end if;

  insert into public.profiles (
    id,
    organization_id,
    full_name,
    role,
    is_active
  )
  values (
    new.id,
    v_organization_id,
    v_full_name,
    'customer',
    true
  );

  return new;
end;
$$;

revoke all on function private.handle_new_auth_user_customer_profile()
  from public, anon, authenticated, service_role;

drop trigger if exists on_auth_user_created_customer_profile on auth.users;
create trigger on_auth_user_created_customer_profile
after insert on auth.users
for each row
execute function private.handle_new_auth_user_customer_profile();

comment on function private.resolve_public_listing_organization_id() is
  'Returns the oldest active organization with show_on_public_site for customer attachment.';
comment on function private.handle_new_auth_user_customer_profile() is
  'Creates a customer profile on the public-listing org for first-time Google Auth users only.';
