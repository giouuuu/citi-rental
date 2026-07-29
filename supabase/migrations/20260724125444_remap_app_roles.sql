-- Remap application roles to: owner, staff, admin, customer.
-- Existing data: administrator -> admin, rental_staff -> staff, viewer -> customer.
-- Developer self-service registration creates an admin profile.
-- Default role for other profiles remains customer.

-- Drop dependent policies before replacing the role enum / helper.
drop policy if exists organizations_update_admin on public.organizations;
drop policy if exists profiles_insert_admin on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;
drop policy if exists notification_preferences_select on public.notification_preferences;
drop policy if exists notification_preferences_insert on public.notification_preferences;
drop policy if exists notification_preferences_update on public.notification_preferences;
drop policy if exists notification_preferences_delete on public.notification_preferences;
drop policy if exists app_settings_select_safe on public.app_settings;
drop policy if exists app_settings_insert_admin on public.app_settings;
drop policy if exists app_settings_update_admin on public.app_settings;
drop policy if exists app_settings_delete_admin on public.app_settings;
drop policy if exists audit_logs_select_admin on public.audit_logs;
drop policy if exists "vehicle_photos_admin_insert" on storage.objects;
drop policy if exists "vehicle_photos_admin_update" on storage.objects;
drop policy if exists "vehicle_photos_admin_delete" on storage.objects;

do $$
declare
  v_table text;
  v_policy text;
begin
  foreach v_table in array array[
    'vehicles', 'gps_devices', 'geofences', 'vehicle_geofences'
  ] loop
    foreach v_policy in array array[
      v_table || '_insert_admin',
      v_table || '_update_admin',
      v_table || '_delete_admin'
    ] loop
      execute format('drop policy if exists %I on public.%I', v_policy, v_table);
    end loop;
  end loop;

  foreach v_table in array array['customers', 'rentals', 'rental_geofences'] loop
    foreach v_policy in array array[
      v_table || '_insert_staff',
      v_table || '_update_staff',
      v_table || '_delete_staff'
    ] loop
      execute format('drop policy if exists %I on public.%I', v_policy, v_table);
    end loop;
  end loop;
end
$$;

drop function if exists private.assign_gps_device_impl(uuid, uuid);
drop function if exists private.transition_rental_impl(
  uuid,
  public.rental_status,
  timestamptz,
  numeric,
  numeric,
  text
);
drop function if exists private.acknowledge_tracking_event_impl(uuid, text);
drop function if exists private.update_organization_settings_impl(
  text,
  text,
  integer,
  integer,
  integer,
  text
);
drop function if exists private.current_app_role();

alter table public.profiles
  alter column role drop default;

alter table public.profiles
  alter column role type text using role::text;

drop type public.app_role;

create type public.app_role as enum ('owner', 'staff', 'admin', 'customer');

update public.profiles
set role = case role
  when 'administrator' then 'admin'
  when 'rental_staff' then 'staff'
  when 'viewer' then 'customer'
  else role
end;

alter table public.profiles
  alter column role type public.app_role using role::public.app_role,
  alter column role set default 'customer'::public.app_role;

create or replace function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.profiles
  where id = (select auth.uid())
    and is_active = true
$$;

revoke all on function private.current_app_role() from public, anon;
grant execute on function private.current_app_role() to authenticated, service_role;

-- Organization / profile admin policies (owner + admin).
create policy organizations_update_admin
on public.organizations
for update
to authenticated
using (
  id = (select private.current_organization_id())
  and (select private.current_app_role()) in ('owner', 'admin')
)
with check (
  id = (select private.current_organization_id())
  and (select private.current_app_role()) in ('owner', 'admin')
);

create policy profiles_insert_admin
on public.profiles
for insert
to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) in ('owner', 'admin')
);

create policy profiles_update_admin
on public.profiles
for update
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) in ('owner', 'admin')
)
with check (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) in ('owner', 'admin')
);

-- Resource write policies.
do $$
declare
  v_table text;
  v_predicate text :=
    'organization_id = (select private.current_organization_id()) '
    || 'and (select private.current_app_role()) in (''owner'', ''admin'')';
begin
  foreach v_table in array array[
    'vehicles', 'gps_devices', 'geofences', 'vehicle_geofences'
  ] loop
    execute format('drop policy if exists %I on public.%I',
      v_table || '_insert_admin', v_table);
    execute format('drop policy if exists %I on public.%I',
      v_table || '_update_admin', v_table);
    execute format('drop policy if exists %I on public.%I',
      v_table || '_delete_admin', v_table);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (%s)',
      v_table || '_insert_admin', v_table, v_predicate
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
      v_table || '_update_admin', v_table, v_predicate, v_predicate
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (%s)',
      v_table || '_delete_admin', v_table, v_predicate
    );
  end loop;
end
$$;

do $$
declare
  v_table text;
  v_predicate text :=
    'organization_id = (select private.current_organization_id()) '
    || 'and (select private.current_app_role()) in (''owner'', ''admin'', ''staff'')';
begin
  foreach v_table in array array['customers', 'rentals', 'rental_geofences'] loop
    execute format('drop policy if exists %I on public.%I',
      v_table || '_insert_staff', v_table);
    execute format('drop policy if exists %I on public.%I',
      v_table || '_update_staff', v_table);
    execute format('drop policy if exists %I on public.%I',
      v_table || '_delete_staff', v_table);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (%s)',
      v_table || '_insert_staff', v_table, v_predicate
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
      v_table || '_update_staff', v_table, v_predicate, v_predicate
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (%s)',
      v_table || '_delete_staff', v_table, v_predicate
    );
  end loop;
end
$$;

drop policy if exists notification_preferences_select
  on public.notification_preferences;
create policy notification_preferences_select
on public.notification_preferences for select to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (
    profile_id = (select auth.uid())
    or (select private.current_app_role()) in ('owner', 'admin')
  )
);

drop policy if exists notification_preferences_insert
  on public.notification_preferences;
drop policy if exists notification_preferences_update
  on public.notification_preferences;
drop policy if exists notification_preferences_delete
  on public.notification_preferences;
create policy notification_preferences_insert
on public.notification_preferences for insert to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and (
    profile_id = (select auth.uid())
    or (select private.current_app_role()) in ('owner', 'admin')
  )
);
create policy notification_preferences_update
on public.notification_preferences for update to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (
    profile_id = (select auth.uid())
    or (select private.current_app_role()) in ('owner', 'admin')
  )
)
with check (
  organization_id = (select private.current_organization_id())
  and (
    profile_id = (select auth.uid())
    or (select private.current_app_role()) in ('owner', 'admin')
  )
);
create policy notification_preferences_delete
on public.notification_preferences for delete to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (
    profile_id = (select auth.uid())
    or (select private.current_app_role()) in ('owner', 'admin')
  )
);

drop policy if exists app_settings_select_safe on public.app_settings;
create policy app_settings_select_safe
on public.app_settings for select to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (
    not is_sensitive
    or (select private.current_app_role()) in ('owner', 'admin')
  )
);

drop policy if exists app_settings_insert_admin on public.app_settings;
drop policy if exists app_settings_update_admin on public.app_settings;
drop policy if exists app_settings_delete_admin on public.app_settings;
create policy app_settings_insert_admin
on public.app_settings for insert to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) in ('owner', 'admin')
);
create policy app_settings_update_admin
on public.app_settings for update to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) in ('owner', 'admin')
)
with check (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) in ('owner', 'admin')
);
create policy app_settings_delete_admin
on public.app_settings for delete to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) in ('owner', 'admin')
);

drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin
on public.audit_logs for select to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) in ('owner', 'admin')
);

-- Vehicle photo storage policies.
drop policy if exists "vehicle_photos_admin_insert" on storage.objects;
drop policy if exists "vehicle_photos_admin_update" on storage.objects;
drop policy if exists "vehicle_photos_admin_delete" on storage.objects;

create policy "vehicle_photos_admin_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'vehicle-photos'
  and (select private.current_app_role()) in ('owner', 'admin')
);

create policy "vehicle_photos_admin_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'vehicle-photos'
  and (select private.current_app_role()) in ('owner', 'admin')
)
with check (
  bucket_id = 'vehicle-photos'
  and (select private.current_app_role()) in ('owner', 'admin')
);

create policy "vehicle_photos_admin_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'vehicle-photos'
  and (select private.current_app_role()) in ('owner', 'admin')
);

-- Privileged RPCs.
create or replace function private.assign_gps_device_impl(
  p_device_id uuid,
  p_vehicle_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid := private.current_organization_id();
  v_device public.gps_devices%rowtype;
begin
  if v_organization_id is null
    or private.current_app_role() not in ('owner', 'admin') then
    raise exception 'Owner or admin access is required.' using errcode = 'insufficient_privilege';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('gps-device-assignment:' || v_organization_id::text, 0)
  );

  select * into v_device
  from public.gps_devices d
  where d.id = p_device_id and d.organization_id = v_organization_id
  for update;
  if not found then
    raise exception 'GPS device was not found.' using errcode = 'no_data_found';
  end if;

  if p_vehicle_id is not null then
    perform 1
    from public.vehicles v
    where v.id = p_vehicle_id
      and v.organization_id = v_organization_id
      and v.status <> 'inactive'
    for update;
    if not found then
      raise exception 'Active vehicle was not found.' using errcode = 'no_data_found';
    end if;

    update public.gps_devices
    set vehicle_id = null
    where organization_id = v_organization_id
      and vehicle_id = p_vehicle_id
      and is_active
      and id <> p_device_id;
  end if;

  update public.gps_devices
  set vehicle_id = p_vehicle_id
  where id = p_device_id and organization_id = v_organization_id;
  return p_device_id;
end;
$$;

create or replace function private.transition_rental_impl(
  p_rental_id uuid,
  p_status public.rental_status,
  p_actual_return_at timestamptz,
  p_ending_odometer numeric,
  p_ending_fuel_level numeric,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid := private.current_organization_id();
  v_role public.app_role := private.current_app_role();
begin
  if v_organization_id is null
    or v_role not in ('owner', 'admin', 'staff') then
    raise exception 'Staff access is required.' using errcode = 'insufficient_privilege';
  end if;

  perform 1 from public.rentals r
  where r.id = p_rental_id and r.organization_id = v_organization_id
  for update;
  if not found then
    raise exception 'Rental was not found.' using errcode = 'no_data_found';
  end if;

  update public.rentals
  set status = p_status,
      actual_return_at = case
        when p_status = 'completed' then coalesce(p_actual_return_at, now())
        else actual_return_at
      end,
      ending_odometer = coalesce(p_ending_odometer, ending_odometer),
      ending_fuel_level = coalesce(p_ending_fuel_level, ending_fuel_level),
      notes = coalesce(p_notes, notes)
  where id = p_rental_id and organization_id = v_organization_id;

  perform private.write_audit_log(
    v_organization_id,
    'rental.transitioned',
    'rental',
    p_rental_id,
    null,
    jsonb_build_object('status', p_status),
    '{}'::jsonb
  );
  return p_rental_id;
end;
$$;

create or replace function private.acknowledge_tracking_event_impl(
  p_event_id uuid,
  p_resolution_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid := private.current_organization_id();
  v_role public.app_role := private.current_app_role();
  v_event public.tracking_events%rowtype;
begin
  if v_organization_id is null
    or v_role not in ('owner', 'admin', 'staff') then
    raise exception 'Staff access is required.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_event
  from public.tracking_events e
  where e.id = p_event_id and e.organization_id = v_organization_id
  for update;
  if not found then
    raise exception 'Tracking event was not found.' using errcode = 'no_data_found';
  end if;

  update public.tracking_events
  set is_acknowledged = true,
      acknowledged_by = (select auth.uid()),
      acknowledged_at = coalesce(v_event.acknowledged_at, now()),
      resolution_note = coalesce(nullif(trim(p_resolution_note), ''), v_event.resolution_note)
  where id = p_event_id;

  perform private.write_audit_log(
    v_organization_id,
    'tracking_event.acknowledged',
    'tracking_event',
    p_event_id,
    jsonb_build_object(
      'is_acknowledged', v_event.is_acknowledged,
      'resolution_note', v_event.resolution_note
    ),
    jsonb_build_object(
      'is_acknowledged', true,
      'resolution_note', coalesce(nullif(trim(p_resolution_note), ''), v_event.resolution_note)
    ),
    '{}'::jsonb
  );
  return p_event_id;
end;
$$;

create or replace function private.update_organization_settings_impl(
  p_name text,
  p_timezone text,
  p_online_threshold integer,
  p_delayed_threshold integer,
  p_retention_days integer,
  p_gps_provider text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid := private.current_organization_id();
  v_old_data jsonb;
begin
  if v_organization_id is null
    or private.current_app_role() not in ('owner', 'admin') then
    raise exception 'Owner or admin access is required.' using errcode = 'insufficient_privilege';
  end if;
  if char_length(trim(p_name)) not between 2 and 120 then
    raise exception 'Organization name must contain 2 to 120 characters.'
      using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_timezone_names where name = p_timezone
  ) then
    raise exception 'Unknown IANA timezone.' using errcode = 'check_violation';
  end if;
  if p_online_threshold < 1
    or p_delayed_threshold <= p_online_threshold
    or p_retention_days not between 1 and 3650 then
    raise exception 'Thresholds or retention period are invalid.'
      using errcode = 'check_violation';
  end if;
  if p_gps_provider not in ('simulator', 'traccar') then
    raise exception 'GPS provider must be simulator or traccar.'
      using errcode = 'check_violation';
  end if;

  select jsonb_build_object('name', o.name, 'timezone', o.timezone)
    into v_old_data
  from public.organizations o
  where o.id = v_organization_id
  for update;

  update public.organizations
  set name = trim(p_name), timezone = p_timezone
  where id = v_organization_id;

  insert into public.app_settings (
    organization_id, setting_key, setting_value, description, is_sensitive
  ) values
    (v_organization_id, 'tracker.online_threshold_minutes',
      to_jsonb(p_online_threshold), 'Minutes before a tracker is no longer online.', false),
    (v_organization_id, 'tracker.delayed_threshold_minutes',
      to_jsonb(p_delayed_threshold), 'Minutes before a tracker is considered offline.', false),
    (v_organization_id, 'location.retention_days',
      to_jsonb(p_retention_days), 'Detailed location-history retention in days.', false),
    (v_organization_id, 'gps.provider',
      to_jsonb(p_gps_provider), 'Active normalized GPS provider.', false)
  on conflict (organization_id, setting_key) do update set
    setting_value = excluded.setting_value,
    description = excluded.description,
    is_sensitive = false;

  perform private.write_audit_log(
    v_organization_id,
    'organization.settings_updated',
    'organization',
    v_organization_id,
    v_old_data,
    jsonb_build_object(
      'name', trim(p_name), 'timezone', p_timezone,
      'online_threshold_minutes', p_online_threshold,
      'delayed_threshold_minutes', p_delayed_threshold,
      'retention_days', p_retention_days, 'gps_provider', p_gps_provider
    ),
    '{}'::jsonb
  );
  return v_organization_id;
end;
$$;

-- Developer self-service signup creates an admin profile.
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
    'admin',
    true
  );

  return query select v_organization_id, v_user_id;
end;
$$;

comment on function private.complete_self_service_registration(text, text) is
  'Creates one isolated organization and admin profile for developer self-service registration.';
comment on column public.profiles.role is
  'Application role: owner, staff, admin (developers), or customer. Never sourced from user metadata.';
