-- Customers who book (or sign in) with an emailed 6-digit code get a Supabase
-- account from signInWithOtp, but the auth.users trigger only provisions
-- Google sign-ups. This gives such an account its customer profile right after
-- the code is verified.
--
-- Never grants more than 'customer': unlike complete_self_service_registration
-- there is no first-account-becomes-admin branch, so an email code can never
-- produce an ops account. An existing profile (any role) is left untouched.

create or replace function private.ensure_customer_profile(p_full_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_full_name text := btrim(coalesce(p_full_name, ''));
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select u.email into v_email from auth.users u where u.id = v_user_id;
  if not found then
    raise exception 'Authentication identity was not found.' using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles p where p.id = v_user_id) then
    return v_user_id;
  end if;

  if not exists (
    select 1 from public.company_profile o
    where o.is_active and o.show_on_public_site
  ) then
    raise exception 'Public booking is not enabled.' using errcode = 'P0002';
  end if;

  -- Signing in from /login has no name yet: use the email's local part, as
  -- the Google trigger does. The booking replaces it with the typed name.
  if char_length(v_full_name) < 2 then
    v_full_name := coalesce(nullif(split_part(coalesce(v_email, ''), '@', 1), ''), 'Customer');
  end if;
  v_full_name := left(v_full_name, 120);
  if char_length(v_full_name) < 2 then
    v_full_name := 'Customer';
  end if;

  insert into public.profiles (id, full_name, role, is_active)
  values (v_user_id, v_full_name, 'customer', true)
  on conflict (id) do nothing;

  return v_user_id;
end;
$$;

revoke all on function private.ensure_customer_profile(text)
  from public, anon, authenticated, service_role;

create or replace function public.ensure_customer_profile(p_full_name text default null)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.ensure_customer_profile(p_full_name)
$$;

revoke all on function public.ensure_customer_profile(text)
  from public, anon, authenticated, service_role;
grant execute on function public.ensure_customer_profile(text) to authenticated;

comment on function public.ensure_customer_profile(text) is
  'Creates a customer profile for the signed-in account if it has none (email-code sign-ups). Never creates an ops role.';
