-- Provision organization owners explicitly from the self-service registration
-- flow. This avoids assigning a separate organization to staff identities that
-- are created or invited through Supabase Auth.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists private.handle_new_user();

create or replace function private.complete_self_service_registration(
  p_full_name text,
  p_organization_name text
)
returns table (organization_id uuid, profile_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_full_name text := btrim(coalesce(p_full_name, ''));
  v_organization_name text := btrim(coalesce(p_organization_name, ''));
  v_slug_base text;
  v_organization_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  -- Serialize provisioning for this Auth identity and confirm it still exists.
  perform 1 from auth.users where id = v_user_id for update;
  if not found then
    raise exception 'Authentication identity was not found.' using errcode = '42501';
  end if;

  select profiles.organization_id
  into v_organization_id
  from public.profiles
  where profiles.id = v_user_id;

  if found then
    return query select v_organization_id, v_user_id;
    return;
  end if;

  if char_length(v_full_name) not between 2 and 120 then
    raise exception 'Full name must contain between 2 and 120 characters.'
      using errcode = '22023';
  end if;
  if char_length(v_organization_name) not between 2 and 120 then
    raise exception 'Organization name must contain between 2 and 120 characters.'
      using errcode = '22023';
  end if;

  v_slug_base := trim(
    both '-' from regexp_replace(lower(v_organization_name), '[^a-z0-9]+', '-', 'g')
  );
  v_slug_base := regexp_replace(
    left(coalesce(nullif(v_slug_base, ''), 'rental'), 70),
    '-+$',
    ''
  );

  insert into public.organizations (name, slug)
  values (
    v_organization_name,
    v_slug_base || '-' || left(replace(v_user_id::text, '-', ''), 12)
  )
  returning id into v_organization_id;

  insert into public.profiles (
    id,
    organization_id,
    full_name,
    role,
    is_active
  )
  values (
    v_user_id,
    v_organization_id,
    v_full_name,
    'administrator',
    true
  );

  return query select v_organization_id, v_user_id;
end;
$$;

revoke all on function private.complete_self_service_registration(text, text)
  from public, anon, authenticated, service_role;
grant execute on function private.complete_self_service_registration(text, text)
  to authenticated;

create or replace function public.complete_self_service_registration(
  p_full_name text,
  p_organization_name text
)
returns table (organization_id uuid, profile_id uuid)
language sql
volatile
security invoker
set search_path = ''
as $$
  select *
  from private.complete_self_service_registration(p_full_name, p_organization_name)
$$;

revoke all on function public.complete_self_service_registration(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_self_service_registration(text, text)
  to authenticated;

comment on function private.complete_self_service_registration(text, text) is
  'Creates one isolated organization and fixed administrator profile for the authenticated self-service registrant.';
comment on function public.complete_self_service_registration(text, text) is
  'RLS-safe public wrapper for self-service organization provisioning.';
