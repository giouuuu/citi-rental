-- Complete MVP fleet, rental, tracking, geofence, alert, and settings schema.
-- This migration is intentionally additive to 20260713073035_initial_foundation.sql.

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

create type public.vehicle_status as enum
  ('available', 'reserved', 'rented', 'maintenance', 'inactive');
create type public.vehicle_transmission as enum ('automatic', 'manual', 'cvt');
create type public.vehicle_fuel_type as enum
  ('gasoline', 'diesel', 'hybrid', 'electric', 'other');
create type public.tracker_status as enum ('online', 'delayed', 'offline', 'unknown');
create type public.rental_status as enum
  ('draft', 'reserved', 'active', 'completed', 'cancelled', 'overdue');
create type public.geofence_shape_type as enum ('circle', 'polygon');
create type public.geofence_type as enum
  ('allowed_area', 'restricted_area', 'branch', 'pickup_zone', 'return_zone');
create type public.geofence_alert_mode as enum ('entry', 'exit', 'both');
create type public.tracking_event_type as enum (
  'geofence_enter', 'geofence_exit', 'tracker_offline', 'tracker_online',
  'overspeed', 'unauthorized_movement', 'ignition_on', 'ignition_off',
  'power_disconnected', 'rental_overdue', 'device_alarm', 'system_error'
);
create type public.event_severity as enum ('info', 'warning', 'critical');
create type public.integration_sync_status as enum
  ('started', 'succeeded', 'partially_succeeded', 'failed');

alter table public.profiles
  add constraint profiles_organization_id_id_key unique (organization_id, id);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  plate_number text not null check (char_length(trim(plate_number)) between 1 and 32),
  name text not null check (char_length(trim(name)) between 1 and 120),
  make text not null check (char_length(trim(make)) between 1 and 80),
  model text not null check (char_length(trim(model)) between 1 and 80),
  year smallint not null check (year between 1900 and 2100),
  color text check (color is null or char_length(trim(color)) <= 60),
  category text check (category is null or char_length(trim(category)) <= 80),
  transmission public.vehicle_transmission,
  fuel_type public.vehicle_fuel_type,
  seating_capacity smallint check (seating_capacity is null or seating_capacity between 1 and 100),
  current_odometer numeric(12, 1) check (current_odometer is null or current_odometer >= 0),
  status public.vehicle_status not null default 'available',
  photo_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicles_organization_id_id_key unique (organization_id, id)
);

create table public.gps_devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  traccar_device_id text,
  unique_identifier text not null check (char_length(trim(unique_identifier)) between 1 and 120),
  name text not null check (char_length(trim(name)) between 1 and 120),
  model text,
  protocol text,
  traccar_server_reference text,
  sim_phone_number text,
  sim_network text,
  vehicle_id uuid,
  installed_at date,
  last_communication_at timestamptz,
  status public.tracker_status not null default 'unknown',
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gps_devices_organization_id_id_key unique (organization_id, id),
  constraint gps_devices_vehicle_tenant_fkey
    foreign key (organization_id, vehicle_id)
    references public.vehicles (organization_id, id) on delete restrict
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  full_name text not null check (char_length(trim(full_name)) between 1 and 120),
  email text,
  phone_number text not null check (char_length(trim(phone_number)) between 1 and 40),
  address text,
  drivers_license_number text not null
    check (char_length(trim(drivers_license_number)) between 1 and 80),
  drivers_license_expires_at date,
  emergency_contact_name text,
  emergency_contact_number text,
  facebook_profile_url text,
  notes text,
  is_blocked boolean not null default false,
  tracking_consent_at timestamptz,
  tracking_disclosure_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_organization_id_id_key unique (organization_id, id),
  constraint customers_tracking_consent_pair_check check (
    (tracking_consent_at is null and tracking_disclosure_version is null)
    or (tracking_consent_at is not null and nullif(trim(tracking_disclosure_version), '') is not null)
  )
);

create table public.rentals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  reference_number text not null check (char_length(trim(reference_number)) between 1 and 60),
  customer_id uuid not null,
  vehicle_id uuid not null,
  start_at timestamptz not null,
  expected_return_at timestamptz not null,
  actual_return_at timestamptz,
  pickup_location text,
  return_location text,
  starting_odometer numeric(12, 1) check (starting_odometer is null or starting_odometer >= 0),
  ending_odometer numeric(12, 1) check (ending_odometer is null or ending_odometer >= 0),
  starting_fuel_level numeric(5, 2)
    check (starting_fuel_level is null or starting_fuel_level between 0 and 100),
  ending_fuel_level numeric(5, 2)
    check (ending_fuel_level is null or ending_fuel_level between 0 and 100),
  status public.rental_status not null default 'draft',
  tracking_consent_at timestamptz,
  notes text,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rentals_organization_id_id_key unique (organization_id, id),
  constraint rentals_reference_organization_key unique (organization_id, reference_number),
  constraint rentals_customer_tenant_fkey
    foreign key (organization_id, customer_id)
    references public.customers (organization_id, id) on delete restrict,
  constraint rentals_vehicle_tenant_fkey
    foreign key (organization_id, vehicle_id)
    references public.vehicles (organization_id, id) on delete restrict,
  constraint rentals_time_order_check check (expected_return_at > start_at),
  constraint rentals_actual_return_check check (
    actual_return_at is null or actual_return_at >= start_at
  ),
  constraint rentals_odometer_order_check check (
    ending_odometer is null or starting_odometer is null or ending_odometer >= starting_odometer
  ),
  constraint rentals_vehicle_schedule_excl exclude using gist (
    vehicle_id with =,
    tstzrange(start_at, expected_return_at, '[)') with &&
  ) where (status in ('reserved', 'active', 'overdue'))
    deferrable initially immediate
);

create table public.geofences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text,
  shape_type public.geofence_shape_type not null,
  center_latitude double precision,
  center_longitude double precision,
  radius_meters numeric(12, 2),
  geometry_geojson jsonb,
  geofence_type public.geofence_type not null,
  alert_mode public.geofence_alert_mode not null default 'both',
  is_active boolean not null default true,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint geofences_organization_id_id_key unique (organization_id, id),
  constraint geofences_geometry_check check (
    (
      shape_type = 'circle'
      and center_latitude between -90 and 90
      and center_longitude between -180 and 180
      and radius_meters > 0
    )
    or (shape_type = 'polygon' and geometry_geojson is not null)
  )
);

create table public.rental_geofences (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  rental_id uuid not null,
  geofence_id uuid not null,
  alert_mode public.geofence_alert_mode,
  created_at timestamptz not null default now(),
  primary key (rental_id, geofence_id),
  constraint rental_geofences_rental_tenant_fkey
    foreign key (organization_id, rental_id)
    references public.rentals (organization_id, id) on delete cascade,
  constraint rental_geofences_geofence_tenant_fkey
    foreign key (organization_id, geofence_id)
    references public.geofences (organization_id, id) on delete cascade
);

create table public.vehicle_geofences (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  vehicle_id uuid not null,
  geofence_id uuid not null,
  alert_mode public.geofence_alert_mode,
  created_at timestamptz not null default now(),
  primary key (vehicle_id, geofence_id),
  constraint vehicle_geofences_vehicle_tenant_fkey
    foreign key (organization_id, vehicle_id)
    references public.vehicles (organization_id, id) on delete cascade,
  constraint vehicle_geofences_geofence_tenant_fkey
    foreign key (organization_id, geofence_id)
    references public.geofences (organization_id, id) on delete cascade
);

create table public.vehicle_latest_locations (
  vehicle_id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  gps_device_id uuid not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  altitude double precision,
  speed_kph numeric(10, 3) check (speed_kph is null or speed_kph >= 0),
  heading numeric(6, 3) check (heading is null or heading between 0 and 360),
  accuracy_meters numeric(10, 3) check (accuracy_meters is null or accuracy_meters >= 0),
  ignition boolean,
  motion boolean,
  external_power boolean,
  battery_level numeric(5, 2) check (battery_level is null or battery_level between 0 and 100),
  alarm_type text,
  gps_valid boolean,
  device_time timestamptz not null,
  server_time timestamptz,
  received_at timestamptz not null default now(),
  raw_attributes jsonb not null default '{}'::jsonb
    check (jsonb_typeof(raw_attributes) = 'object'),
  updated_at timestamptz not null default now(),
  constraint vehicle_latest_locations_vehicle_tenant_fkey
    foreign key (organization_id, vehicle_id)
    references public.vehicles (organization_id, id) on delete cascade,
  constraint vehicle_latest_locations_device_tenant_fkey
    foreign key (organization_id, gps_device_id)
    references public.gps_devices (organization_id, id) on delete restrict
);

create table public.vehicle_location_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  vehicle_id uuid not null,
  gps_device_id uuid not null,
  rental_id uuid,
  source_position_id text,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  altitude double precision,
  speed_kph numeric(10, 3) check (speed_kph is null or speed_kph >= 0),
  heading numeric(6, 3) check (heading is null or heading between 0 and 360),
  accuracy_meters numeric(10, 3) check (accuracy_meters is null or accuracy_meters >= 0),
  ignition boolean,
  motion boolean,
  external_power boolean,
  battery_level numeric(5, 2) check (battery_level is null or battery_level between 0 and 100),
  alarm_type text,
  gps_valid boolean,
  device_time timestamptz not null,
  server_time timestamptz,
  received_at timestamptz not null default now(),
  raw_attributes jsonb not null default '{}'::jsonb
    check (jsonb_typeof(raw_attributes) = 'object'),
  created_at timestamptz not null default now(),
  constraint vehicle_location_history_vehicle_tenant_fkey
    foreign key (organization_id, vehicle_id)
    references public.vehicles (organization_id, id) on delete cascade,
  constraint vehicle_location_history_device_tenant_fkey
    foreign key (organization_id, gps_device_id)
    references public.gps_devices (organization_id, id) on delete restrict,
  constraint vehicle_location_history_rental_tenant_fkey
    foreign key (organization_id, rental_id)
    references public.rentals (organization_id, id) on delete set null
);

create table public.tracking_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  vehicle_id uuid not null,
  gps_device_id uuid,
  rental_id uuid,
  geofence_id uuid,
  event_type public.tracking_event_type not null,
  severity public.event_severity not null default 'info',
  event_timestamp timestamptz not null,
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  speed_kph numeric(10, 3) check (speed_kph is null or speed_kph >= 0),
  raw_traccar_event_id text,
  raw_attributes jsonb not null default '{}'::jsonb
    check (jsonb_typeof(raw_attributes) = 'object'),
  is_acknowledged boolean not null default false,
  acknowledged_by uuid references public.profiles(id) on delete set null,
  acknowledged_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tracking_events_organization_id_id_key unique (organization_id, id),
  constraint tracking_events_raw_id_key unique (organization_id, raw_traccar_event_id),
  constraint tracking_events_vehicle_tenant_fkey
    foreign key (organization_id, vehicle_id)
    references public.vehicles (organization_id, id) on delete cascade,
  constraint tracking_events_device_tenant_fkey
    foreign key (organization_id, gps_device_id)
    references public.gps_devices (organization_id, id) on delete restrict,
  constraint tracking_events_rental_tenant_fkey
    foreign key (organization_id, rental_id)
    references public.rentals (organization_id, id) on delete set null,
  constraint tracking_events_geofence_tenant_fkey
    foreign key (organization_id, geofence_id)
    references public.geofences (organization_id, id) on delete set null,
  constraint tracking_events_acknowledgement_check check (
    (not is_acknowledged and acknowledged_by is null and acknowledged_at is null)
    or (is_acknowledged and acknowledged_by is not null and acknowledged_at is not null)
  )
);

create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  profile_id uuid not null,
  event_type public.tracking_event_type,
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default false,
  minimum_severity public.event_severity not null default 'warning',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_preferences_org_profile_event_key
    unique nulls not distinct (organization_id, profile_id, event_type),
  constraint notification_preferences_profile_tenant_fkey
    foreign key (organization_id, profile_id)
    references public.profiles (organization_id, id) on delete cascade
);

create table public.integration_sync_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (char_length(trim(provider)) between 1 and 80),
  operation text not null check (char_length(trim(operation)) between 1 and 120),
  status public.integration_sync_status not null default 'started',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  records_read integer not null default 0 check (records_read >= 0),
  records_written integer not null default 0 check (records_written >= 0),
  records_skipped integer not null default 0 check (records_skipped >= 0),
  retry_count integer not null default 0 check (retry_count >= 0),
  error_summary text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint integration_sync_logs_completion_check check (
    completed_at is null or completed_at >= started_at
  )
);

create table public.app_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  setting_key text not null check (
    char_length(trim(setting_key)) between 1 and 120
    and setting_key ~ '^[a-z][a-z0-9_.-]*$'
  ),
  setting_value jsonb not null,
  description text,
  is_sensitive boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_settings_organization_key unique (organization_id, setting_key)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null check (char_length(trim(action)) between 1 and 120),
  resource_type text not null check (char_length(trim(resource_type)) between 1 and 120),
  resource_id uuid,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

-- Uniqueness and high-value filter/order indexes.
create unique index vehicles_active_plate_organization_uidx
  on public.vehicles (organization_id, lower(trim(plate_number)))
  where status <> 'inactive';
create index vehicles_organization_status_idx
  on public.vehicles (organization_id, status, updated_at desc);

create unique index gps_devices_active_identifier_organization_uidx
  on public.gps_devices (organization_id, lower(trim(unique_identifier)))
  where is_active;
create unique index gps_devices_active_vehicle_uidx
  on public.gps_devices (vehicle_id) where is_active and vehicle_id is not null;
create index gps_devices_vehicle_id_idx
  on public.gps_devices (vehicle_id) where vehicle_id is not null;
create index gps_devices_organization_status_idx
  on public.gps_devices (organization_id, status, last_communication_at desc);

create unique index customers_license_organization_uidx
  on public.customers (organization_id, lower(trim(drivers_license_number)));
create index customers_organization_name_idx
  on public.customers (organization_id, lower(full_name));
create index customers_organization_blocked_idx
  on public.customers (organization_id, is_blocked) where is_blocked;

create index rentals_customer_id_idx on public.rentals (customer_id);
create index rentals_vehicle_id_idx on public.rentals (vehicle_id);
create index rentals_created_by_idx on public.rentals (created_by);
create index rentals_organization_status_expected_idx
  on public.rentals (organization_id, status, expected_return_at);
create index rentals_active_vehicle_idx
  on public.rentals (organization_id, vehicle_id, start_at, expected_return_at)
  where status in ('reserved', 'active', 'overdue');

create index geofences_created_by_idx on public.geofences (created_by);
create index geofences_organization_active_type_idx
  on public.geofences (organization_id, geofence_type) where is_active;
create index rental_geofences_geofence_id_idx
  on public.rental_geofences (geofence_id);
create index vehicle_geofences_geofence_id_idx
  on public.vehicle_geofences (geofence_id);

create index vehicle_latest_locations_organization_device_time_idx
  on public.vehicle_latest_locations (organization_id, device_time desc);
create index vehicle_latest_locations_gps_device_id_idx
  on public.vehicle_latest_locations (gps_device_id);

create unique index vehicle_location_history_source_position_uidx
  on public.vehicle_location_history (organization_id, gps_device_id, source_position_id)
  where source_position_id is not null;
create unique index vehicle_location_history_fallback_uidx
  on public.vehicle_location_history
    (organization_id, gps_device_id, device_time, latitude, longitude);
create index vehicle_location_history_vehicle_time_idx
  on public.vehicle_location_history (vehicle_id, device_time desc);
create index vehicle_location_history_rental_time_idx
  on public.vehicle_location_history (rental_id, device_time)
  where rental_id is not null;
create index vehicle_location_history_device_time_idx
  on public.vehicle_location_history (gps_device_id, device_time desc);

create index tracking_events_vehicle_time_idx
  on public.tracking_events (vehicle_id, event_timestamp desc);
create index tracking_events_device_time_idx
  on public.tracking_events (gps_device_id, event_timestamp desc)
  where gps_device_id is not null;
create index tracking_events_rental_time_idx
  on public.tracking_events (rental_id, event_timestamp desc)
  where rental_id is not null;
create index tracking_events_geofence_id_idx
  on public.tracking_events (geofence_id) where geofence_id is not null;
create index tracking_events_unresolved_idx
  on public.tracking_events (organization_id, severity, event_timestamp desc)
  where not is_acknowledged;
create index tracking_events_filter_idx
  on public.tracking_events (organization_id, event_type, event_timestamp desc);
create index tracking_events_acknowledged_by_idx
  on public.tracking_events (acknowledged_by) where acknowledged_by is not null;

create index notification_preferences_profile_id_idx
  on public.notification_preferences (profile_id);
create index integration_sync_logs_health_idx
  on public.integration_sync_logs (organization_id, provider, started_at desc);
create index audit_logs_resource_idx
  on public.audit_logs (organization_id, resource_type, resource_id, created_at desc);
create index audit_logs_actor_idx
  on public.audit_logs (actor_profile_id, created_at desc)
  where actor_profile_id is not null;

create or replace function private.write_audit_log(
  p_organization_id uuid,
  p_action text,
  p_resource_type text,
  p_resource_id uuid,
  p_old_data jsonb default null,
  p_new_data jsonb default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.audit_logs (
    organization_id, actor_profile_id, action, resource_type, resource_id,
    old_data, new_data, metadata
  ) values (
    p_organization_id, (select auth.uid()), p_action, p_resource_type, p_resource_id,
    p_old_data, p_new_data, coalesce(p_metadata, '{}'::jsonb)
  )
$$;

create or replace function private.guard_vehicle_availability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'available' and (
    tg_op = 'INSERT' or old.status is distinct from new.status
  ) and exists (
    select 1
    from public.rentals r
    where r.organization_id = new.organization_id
      and r.vehicle_id = new.id
      and r.status in ('active', 'overdue')
  ) then
    raise exception 'A vehicle with an active or overdue rental cannot be marked available.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create or replace function private.audit_device_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.vehicle_id is distinct from new.vehicle_id then
    perform private.write_audit_log(
      new.organization_id,
      case when new.vehicle_id is null then 'gps_device.unassigned' else 'gps_device.assigned' end,
      'gps_device',
      new.id,
      jsonb_build_object('vehicle_id', old.vehicle_id),
      jsonb_build_object('vehicle_id', new.vehicle_id),
      '{}'::jsonb
    );
  end if;
  return new;
end;
$$;

create or replace function private.validate_rental_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_blocked boolean;
  v_customer_consent timestamptz;
  v_vehicle_status public.vehicle_status;
begin
  if tg_op = 'UPDATE' then
    if old.status <> 'draft' and (
      new.customer_id is distinct from old.customer_id
      or new.vehicle_id is distinct from old.vehicle_id
      or new.organization_id is distinct from old.organization_id
    ) then
      raise exception 'Customer, vehicle, and organization cannot change after a rental leaves draft.'
        using errcode = 'check_violation';
    end if;

    if new.status is distinct from old.status and not (
      (old.status = 'draft' and new.status in ('reserved', 'active', 'cancelled'))
      or (old.status = 'reserved' and new.status in ('active', 'cancelled', 'overdue'))
      or (old.status = 'active' and new.status in ('completed', 'cancelled', 'overdue'))
      or (old.status = 'overdue' and new.status in ('completed', 'cancelled'))
    ) then
      raise exception 'Invalid rental status transition from % to %.', old.status, new.status
        using errcode = 'check_violation';
    end if;
  end if;

  if new.status in ('reserved', 'active', 'overdue') then
    select c.is_blocked, c.tracking_consent_at
      into v_customer_blocked, v_customer_consent
    from public.customers c
    where c.organization_id = new.organization_id and c.id = new.customer_id;

    select v.status into v_vehicle_status
    from public.vehicles v
    where v.organization_id = new.organization_id and v.id = new.vehicle_id
    for update;

    if coalesce(v_customer_blocked, true) then
      raise exception 'Blocked customers cannot reserve or start rentals.'
        using errcode = 'check_violation';
    end if;
    if v_vehicle_status in ('maintenance', 'inactive') then
      raise exception 'A maintenance or inactive vehicle cannot be reserved or rented.'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.status in ('active', 'overdue')
    and coalesce(new.tracking_consent_at, v_customer_consent) is null then
    raise exception 'GPS tracking consent is required before a rental can start.'
      using errcode = 'check_violation';
  end if;

  if new.status = 'completed' and new.actual_return_at is null then
    new.actual_return_at := now();
  end if;
  if new.status <> 'completed' and new.ending_odometer is not null then
    raise exception 'Ending odometer may only be recorded for a completed rental.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create or replace function private.sync_vehicle_status_from_rental()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next_status public.vehicle_status;
begin
  if new.status in ('active', 'overdue') then
    v_next_status := 'rented';
  elsif new.status = 'reserved' then
    v_next_status := 'reserved';
  elsif exists (
    select 1 from public.rentals r
    where r.organization_id = new.organization_id
      and r.vehicle_id = new.vehicle_id
      and r.id <> new.id
      and r.status in ('active', 'overdue')
  ) then
    v_next_status := 'rented';
  elsif exists (
    select 1 from public.rentals r
    where r.organization_id = new.organization_id
      and r.vehicle_id = new.vehicle_id
      and r.id <> new.id
      and r.status = 'reserved'
  ) then
    v_next_status := 'reserved';
  else
    v_next_status := 'available';
  end if;

  update public.vehicles
  set status = v_next_status
  where organization_id = new.organization_id
    and id = new.vehicle_id
    and status not in ('maintenance', 'inactive')
    and status is distinct from v_next_status;

  return new;
end;
$$;

create trigger vehicles_guard_availability
before insert or update of status on public.vehicles
for each row execute function private.guard_vehicle_availability();
create trigger gps_devices_audit_assignment
after update of vehicle_id on public.gps_devices
for each row execute function private.audit_device_assignment();
create trigger rentals_validate_change
before insert or update on public.rentals
for each row execute function private.validate_rental_change();
create trigger rentals_sync_vehicle_status
after insert or update of status, vehicle_id on public.rentals
for each row execute function private.sync_vehicle_status_from_rental();

create trigger vehicles_set_updated_at before update on public.vehicles
for each row execute function private.set_updated_at();
create trigger gps_devices_set_updated_at before update on public.gps_devices
for each row execute function private.set_updated_at();
create trigger customers_set_updated_at before update on public.customers
for each row execute function private.set_updated_at();
create trigger rentals_set_updated_at before update on public.rentals
for each row execute function private.set_updated_at();
create trigger geofences_set_updated_at before update on public.geofences
for each row execute function private.set_updated_at();
create trigger vehicle_latest_locations_set_updated_at
before update on public.vehicle_latest_locations
for each row execute function private.set_updated_at();
create trigger tracking_events_set_updated_at before update on public.tracking_events
for each row execute function private.set_updated_at();
create trigger notification_preferences_set_updated_at
before update on public.notification_preferences
for each row execute function private.set_updated_at();
create trigger app_settings_set_updated_at before update on public.app_settings
for each row execute function private.set_updated_at();
