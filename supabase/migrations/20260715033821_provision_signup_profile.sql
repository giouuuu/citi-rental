-- Provision a separate rental organization and administrator profile for each
-- self-service email signup. User metadata is used only for display names and
-- never for authorization or tenant selection.

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text;
  v_organization_name text;
  v_slug_base text;
  v_organization_id uuid;
begin
  v_full_name := left(
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'New User'
    ),
    120
  );
  if char_length(v_full_name) < 2 then
    v_full_name := 'New User';
  end if;

  v_organization_name := left(
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'organization_name'), ''),
      v_full_name || ' Rentals'
    ),
    120
  );
  if char_length(v_organization_name) < 2 then
    v_organization_name := 'New Rental Organization';
  end if;

  v_slug_base := trim(
    both '-' from regexp_replace(lower(v_organization_name), '[^a-z0-9]+', '-', 'g')
  );
  v_slug_base := regexp_replace(left(coalesce(nullif(v_slug_base, ''), 'rental'), 70), '-+$', '');

  insert into public.organizations (name, slug)
  values (
    v_organization_name,
    v_slug_base || '-' || left(replace(new.id::text, '-', ''), 12)
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
    new.id,
    v_organization_id,
    v_full_name,
    'administrator',
    true
  );

  return new;
end;
$$;

revoke all on function private.handle_new_user()
  from public, anon, authenticated, service_role;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

comment on function private.handle_new_user() is
  'Creates an isolated organization and fixed administrator profile for a new Auth signup.';
