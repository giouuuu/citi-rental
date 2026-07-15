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
    or private.current_app_role() <> 'administrator' then
    raise exception 'Administrator access is required.' using errcode = 'insufficient_privilege';
  end if;

  -- Serialize reassignment inside a tenant to avoid cross-device replacement deadlocks.
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

create or replace function public.assign_gps_device(
  p_device_id uuid,
  p_vehicle_id uuid default null
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.assign_gps_device_impl(p_device_id, p_vehicle_id)
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
  if v_organization_id is null or v_role not in ('administrator', 'rental_staff') then
    raise exception 'Rental staff access is required.' using errcode = 'insufficient_privilege';
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

create or replace function public.transition_rental(
  p_rental_id uuid,
  p_status public.rental_status,
  p_actual_return_at timestamptz default null,
  p_ending_odometer numeric default null,
  p_ending_fuel_level numeric default null,
  p_notes text default null
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.transition_rental_impl(
    p_rental_id, p_status, p_actual_return_at, p_ending_odometer,
    p_ending_fuel_level, p_notes
  )
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
  if v_organization_id is null or v_role not in ('administrator', 'rental_staff') then
    raise exception 'Rental staff access is required.' using errcode = 'insufficient_privilege';
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

create or replace function public.acknowledge_tracking_event(
  p_event_id uuid,
  p_resolution_note text default null
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.acknowledge_tracking_event_impl(p_event_id, p_resolution_note)
$$;

create or replace function public.ingest_tracking_position(
  p_gps_device_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_device_time timestamptz,
  p_source_position_id text default null,
  p_server_time timestamptz default null,
  p_received_at timestamptz default now(),
  p_altitude double precision default null,
  p_speed_kph numeric default null,
  p_heading numeric default null,
  p_accuracy_meters numeric default null,
  p_ignition boolean default null,
  p_motion boolean default null,
  p_external_power boolean default null,
  p_battery_level numeric default null,
  p_alarm_type text default null,
  p_gps_valid boolean default null,
  p_raw_attributes jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_device public.gps_devices%rowtype;
  v_rental_id uuid;
  v_history_id uuid;
begin
  select * into v_device
  from public.gps_devices d
  where d.id = p_gps_device_id and d.is_active
  for update;
  if not found or v_device.vehicle_id is null then
    raise exception 'An active GPS device with a vehicle assignment is required.'
      using errcode = 'foreign_key_violation';
  end if;

  select r.id into v_rental_id
  from public.rentals r
  where r.organization_id = v_device.organization_id
    and r.vehicle_id = v_device.vehicle_id
    and r.status in ('active', 'overdue')
    and p_device_time >= r.start_at
    and (r.actual_return_at is null or p_device_time <= r.actual_return_at)
  order by r.start_at desc
  limit 1;

  insert into public.vehicle_location_history (
    organization_id, vehicle_id, gps_device_id, rental_id, source_position_id,
    latitude, longitude, altitude, speed_kph, heading, accuracy_meters,
    ignition, motion, external_power, battery_level, alarm_type, gps_valid,
    device_time, server_time, received_at, raw_attributes
  ) values (
    v_device.organization_id, v_device.vehicle_id, v_device.id, v_rental_id,
    nullif(trim(p_source_position_id), ''), p_latitude, p_longitude, p_altitude,
    p_speed_kph, p_heading, p_accuracy_meters, p_ignition, p_motion,
    p_external_power, p_battery_level, p_alarm_type, p_gps_valid,
    p_device_time, p_server_time, coalesce(p_received_at, now()),
    coalesce(p_raw_attributes, '{}'::jsonb)
  )
  on conflict do nothing
  returning id into v_history_id;

  if v_history_id is null then
    select h.id into v_history_id
    from public.vehicle_location_history h
    where h.organization_id = v_device.organization_id
      and h.gps_device_id = v_device.id
      and (
        (p_source_position_id is not null and h.source_position_id = nullif(trim(p_source_position_id), ''))
        or (
          h.device_time = p_device_time
          and h.latitude = p_latitude
          and h.longitude = p_longitude
        )
      )
    order by h.created_at
    limit 1;
  end if;

  insert into public.vehicle_latest_locations (
    organization_id, vehicle_id, gps_device_id, latitude, longitude, altitude,
    speed_kph, heading, accuracy_meters, ignition, motion, external_power,
    battery_level, alarm_type, gps_valid, device_time, server_time, received_at,
    raw_attributes
  ) values (
    v_device.organization_id, v_device.vehicle_id, v_device.id, p_latitude,
    p_longitude, p_altitude, p_speed_kph, p_heading, p_accuracy_meters,
    p_ignition, p_motion, p_external_power, p_battery_level, p_alarm_type,
    p_gps_valid, p_device_time, p_server_time, coalesce(p_received_at, now()),
    coalesce(p_raw_attributes, '{}'::jsonb)
  )
  on conflict (vehicle_id) do update set
    organization_id = excluded.organization_id,
    gps_device_id = excluded.gps_device_id,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    altitude = excluded.altitude,
    speed_kph = excluded.speed_kph,
    heading = excluded.heading,
    accuracy_meters = excluded.accuracy_meters,
    ignition = excluded.ignition,
    motion = excluded.motion,
    external_power = excluded.external_power,
    battery_level = excluded.battery_level,
    alarm_type = excluded.alarm_type,
    gps_valid = excluded.gps_valid,
    device_time = excluded.device_time,
    server_time = excluded.server_time,
    received_at = excluded.received_at,
    raw_attributes = excluded.raw_attributes
  where excluded.device_time >= public.vehicle_latest_locations.device_time;

  update public.gps_devices
  set last_communication_at = greatest(
        coalesce(last_communication_at, '-infinity'::timestamptz),
        coalesce(p_received_at, now())
      ),
      status = 'online'
  where id = v_device.id;

  return v_history_id;
end;
$$;

create or replace function public.ingest_tracking_event(
  p_gps_device_id uuid,
  p_event_type public.tracking_event_type,
  p_event_timestamp timestamptz,
  p_severity public.event_severity default 'info',
  p_raw_traccar_event_id text default null,
  p_geofence_id uuid default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_speed_kph numeric default null,
  p_raw_attributes jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_device public.gps_devices%rowtype;
  v_rental_id uuid;
  v_event_id uuid;
begin
  select * into v_device
  from public.gps_devices d
  where d.id = p_gps_device_id and d.vehicle_id is not null;
  if not found then
    raise exception 'A GPS device with a vehicle assignment is required.'
      using errcode = 'foreign_key_violation';
  end if;

  select r.id into v_rental_id
  from public.rentals r
  where r.organization_id = v_device.organization_id
    and r.vehicle_id = v_device.vehicle_id
    and r.status in ('active', 'overdue')
    and p_event_timestamp >= r.start_at
    and (r.actual_return_at is null or p_event_timestamp <= r.actual_return_at)
  order by r.start_at desc limit 1;

  insert into public.tracking_events (
    organization_id, vehicle_id, gps_device_id, rental_id, geofence_id,
    event_type, severity, event_timestamp, latitude, longitude, speed_kph,
    raw_traccar_event_id, raw_attributes
  ) values (
    v_device.organization_id, v_device.vehicle_id, v_device.id, v_rental_id,
    p_geofence_id, p_event_type, p_severity, p_event_timestamp, p_latitude,
    p_longitude, p_speed_kph, nullif(trim(p_raw_traccar_event_id), ''),
    coalesce(p_raw_attributes, '{}'::jsonb)
  )
  on conflict (organization_id, raw_traccar_event_id) do update set
    severity = excluded.severity,
    raw_attributes = excluded.raw_attributes,
    updated_at = now()
  returning id into v_event_id;

  return v_event_id;
end;
$$;

-- Supabase's April 2026 privilege-default change makes Data API exposure opt-in.
-- Keep future objects closed and explicitly grant every table/function below.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'vehicles', 'gps_devices', 'customers', 'rentals', 'geofences',
    'rental_geofences', 'vehicle_geofences', 'vehicle_latest_locations',
    'vehicle_location_history', 'tracking_events', 'notification_preferences',
    'integration_sync_logs', 'app_settings', 'audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('alter table public.%I force row level security', v_table);
  end loop;
end
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
    or private.current_app_role() <> 'administrator' then
    raise exception 'Administrator access is required.' using errcode = 'insufficient_privilege';
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

create or replace function public.update_organization_settings(
  p_name text,
  p_timezone text,
  p_online_threshold integer,
  p_delayed_threshold integer,
  p_retention_days integer,
  p_gps_provider text
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.update_organization_settings_impl(
    p_name, p_timezone, p_online_threshold, p_delayed_threshold,
    p_retention_days, p_gps_provider
  )
$$;

revoke execute on function private.update_organization_settings_impl(
  text, text, integer, integer, integer, text
) from public, anon, authenticated, service_role;
revoke execute on function public.update_organization_settings(
  text, text, integer, integer, integer, text
) from public, anon, authenticated, service_role;
grant execute on function private.update_organization_settings_impl(
  text, text, integer, integer, integer, text
) to authenticated;
grant execute on function public.update_organization_settings(
  text, text, integer, integer, integer, text
) to authenticated;

-- Repair the initial migration's implicit PUBLIC function execution grants.
revoke execute on function private.current_organization_id() from public, anon;
revoke execute on function private.current_app_role() from public, anon;
revoke execute on function private.set_updated_at() from public, anon, authenticated, service_role;
revoke execute on function private.write_audit_log(uuid, text, text, uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.guard_vehicle_availability()
  from public, anon, authenticated, service_role;
revoke execute on function private.audit_device_assignment()
  from public, anon, authenticated, service_role;
revoke execute on function private.validate_rental_change()
  from public, anon, authenticated, service_role;
revoke execute on function private.sync_vehicle_status_from_rental()
  from public, anon, authenticated, service_role;

revoke execute on function private.assign_gps_device_impl(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.transition_rental_impl(
  uuid, public.rental_status, timestamptz, numeric, numeric, text
) from public, anon, authenticated, service_role;
revoke execute on function private.acknowledge_tracking_event_impl(uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function private.current_organization_id() to authenticated, service_role;
grant execute on function private.current_app_role() to authenticated, service_role;
grant execute on function private.assign_gps_device_impl(uuid, uuid) to authenticated;
grant execute on function private.transition_rental_impl(
  uuid, public.rental_status, timestamptz, numeric, numeric, text
) to authenticated;
grant execute on function private.acknowledge_tracking_event_impl(uuid, text) to authenticated;

revoke execute on function public.assign_gps_device(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.transition_rental(
  uuid, public.rental_status, timestamptz, numeric, numeric, text
) from public, anon, authenticated, service_role;
revoke execute on function public.acknowledge_tracking_event(uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.ingest_tracking_position(
  uuid, double precision, double precision, timestamptz, text, timestamptz,
  timestamptz, double precision, numeric, numeric, numeric, boolean, boolean,
  boolean, numeric, text, boolean, jsonb
) from public, anon, authenticated, service_role;
revoke execute on function public.ingest_tracking_event(
  uuid, public.tracking_event_type, timestamptz, public.event_severity, text,
  uuid, double precision, double precision, numeric, jsonb
) from public, anon, authenticated, service_role;

grant execute on function public.assign_gps_device(uuid, uuid) to authenticated;
grant execute on function public.transition_rental(
  uuid, public.rental_status, timestamptz, numeric, numeric, text
) to authenticated;
grant execute on function public.acknowledge_tracking_event(uuid, text) to authenticated;
grant execute on function public.ingest_tracking_position(
  uuid, double precision, double precision, timestamptz, text, timestamptz,
  timestamptz, double precision, numeric, numeric, numeric, boolean, boolean,
  boolean, numeric, text, boolean, jsonb
) to service_role;
grant execute on function public.ingest_tracking_event(
  uuid, public.tracking_event_type, timestamptz, public.event_severity, text,
  uuid, double precision, double precision, numeric, jsonb
) to service_role;

grant usage on type public.vehicle_status, public.vehicle_transmission,
  public.vehicle_fuel_type, public.tracker_status, public.rental_status,
  public.geofence_shape_type, public.geofence_type, public.geofence_alert_mode,
  public.tracking_event_type, public.event_severity,
  public.integration_sync_status to authenticated, service_role;

revoke all on table public.vehicles, public.gps_devices, public.customers,
  public.rentals, public.geofences, public.rental_geofences,
  public.vehicle_geofences, public.vehicle_latest_locations,
  public.vehicle_location_history, public.tracking_events,
  public.notification_preferences, public.integration_sync_logs,
  public.app_settings, public.audit_logs from anon, authenticated;

grant select, insert, update, delete on table
  public.vehicles, public.gps_devices, public.customers, public.rentals,
  public.geofences, public.rental_geofences, public.vehicle_geofences,
  public.notification_preferences, public.app_settings to authenticated;
grant select on table public.vehicle_latest_locations,
  public.vehicle_location_history, public.tracking_events,
  public.integration_sync_logs, public.audit_logs to authenticated;
grant all on table public.vehicles, public.gps_devices, public.customers,
  public.rentals, public.geofences, public.rental_geofences,
  public.vehicle_geofences, public.vehicle_latest_locations,
  public.vehicle_location_history, public.tracking_events,
  public.notification_preferences, public.integration_sync_logs,
  public.app_settings, public.audit_logs to service_role;

-- Common organization-scoped read policy for ordinary business records.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'vehicles', 'gps_devices', 'customers', 'rentals', 'geofences',
    'rental_geofences', 'vehicle_geofences', 'vehicle_latest_locations',
    'vehicle_location_history', 'tracking_events', 'integration_sync_logs'
  ] loop
    execute format(
      'create policy %I on public.%I for select to authenticated '
      || 'using (organization_id = (select private.current_organization_id()))',
      v_table || '_select_organization', v_table
    );
  end loop;
end
$$;

-- Administrator-managed resources.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'vehicles', 'gps_devices', 'geofences', 'vehicle_geofences'
  ] loop
    execute format(
      'create policy %I on public.%I for all to authenticated '
      || 'using (organization_id = (select private.current_organization_id()) '
      || 'and (select private.current_app_role()) = ''administrator'') '
      || 'with check (organization_id = (select private.current_organization_id()) '
      || 'and (select private.current_app_role()) = ''administrator'')',
      v_table || '_write_admin', v_table
    );
  end loop;
end
$$;

-- Rental staff and administrators manage customer/rental workflow records.
do $$
declare
  v_table text;
begin
  foreach v_table in array array['customers', 'rentals', 'rental_geofences'] loop
    execute format(
      'create policy %I on public.%I for all to authenticated '
      || 'using (organization_id = (select private.current_organization_id()) '
      || 'and (select private.current_app_role()) in (''administrator'', ''rental_staff'')) '
      || 'with check (organization_id = (select private.current_organization_id()) '
      || 'and (select private.current_app_role()) in (''administrator'', ''rental_staff''))',
      v_table || '_write_staff', v_table
    );
  end loop;
end
$$;

create policy notification_preferences_select
on public.notification_preferences for select to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (profile_id = (select auth.uid()) or (select private.current_app_role()) = 'administrator')
);
create policy notification_preferences_write
on public.notification_preferences for all to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (profile_id = (select auth.uid()) or (select private.current_app_role()) = 'administrator')
)
with check (
  organization_id = (select private.current_organization_id())
  and (profile_id = (select auth.uid()) or (select private.current_app_role()) = 'administrator')
);

create policy app_settings_select_safe
on public.app_settings for select to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (not is_sensitive or (select private.current_app_role()) = 'administrator')
);
create policy app_settings_write_admin
on public.app_settings for all to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) = 'administrator'
)
with check (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) = 'administrator'
);

create policy audit_logs_select_admin
on public.audit_logs for select to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) = 'administrator'
);

-- Realtime-backed dashboard, fleet map, rental, and alert updates.
do $$
declare
  v_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array[
      'vehicles', 'gps_devices', 'rentals', 'vehicle_latest_locations',
      'tracking_events'
    ] loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = v_table
      ) then
        execute format(
          'alter publication supabase_realtime add table public.%I',
          v_table
        );
      end if;
    end loop;
  end if;
end
$$;
