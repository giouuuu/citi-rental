-- Email self-registration after the workspace has an administrator becomes a
-- customer signup instead of an error. Before, the RPC raised once any active
-- owner/admin existed, leaving a signed-in auth user with no profile.
--
-- The first registrant still becomes admin (same lock as before). Everyone
-- after gets the same customer profile the Google trigger creates, under the
-- same "public booking is enabled" gate. Ops access stays invite/promote-only.

create or replace function private.complete_self_service_registration(p_full_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_full_name text := btrim(coalesce(p_full_name, ''));
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  perform 1 from auth.users where id = v_user_id for update;
  if not found then
    raise exception 'Authentication identity was not found.' using errcode = '42501';
  end if;

  -- Idempotent: an existing profile is returned as-is.
  if exists (select 1 from public.profiles p where p.id = v_user_id) then
    return v_user_id;
  end if;

  if char_length(v_full_name) not between 2 and 120 then
    raise exception 'Full name must contain between 2 and 120 characters.'
      using errcode = '22023';
  end if;

  -- The escalation gate. Lock the table so two concurrent signups cannot both
  -- see "no admin yet" and both become admin.
  lock table public.profiles in share row exclusive mode;

  if exists (
    select 1 from public.profiles p
    where p.role in ('owner', 'admin') and p.is_active
  ) then
    if not exists (
      select 1 from public.company_profile o
      where o.is_active and o.show_on_public_site
    ) then
      raise exception 'Public booking is not enabled.' using errcode = 'P0002';
    end if;

    insert into public.profiles (id, full_name, role, is_active)
    values (v_user_id, v_full_name, 'customer', true);

    return v_user_id;
  end if;

  insert into public.profiles (id, full_name, role, is_active)
  values (v_user_id, v_full_name, 'admin', true);

  return v_user_id;
end;
$$;

revoke all on function private.complete_self_service_registration(text)
  from public, anon, authenticated, service_role;
