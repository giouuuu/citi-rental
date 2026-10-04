-- ===========================================================================
-- Single-tenant: remove the organization dimension.
--
-- This product serves one client (Zeke Car Rentals / City Rentals). The
-- organization layer was never real multi-tenancy -- most visibly,
-- list_public_available_vehicles() unioned every organization that had
-- show_on_public_site set, so a second tenant would have polluted the public
-- storefront. The column was carrying cost without carrying a boundary.
--
-- What replaces it: authorization was always TWO predicates --
--   organization_id = current_organization_id()   AND   <role test>
-- Only the second one ever decided anything in a single-organization database.
-- Every policy here keeps its role test and drops the tenant test.
--
-- IMPORTANT -- the role tests are now null-safe. `v_role not in (...)` is NULL
-- when the caller has no profile, and plpgsql treats a NULL `if` as false, so
-- the old `v_organization_id is null` conjunct was the check actually rejecting
-- profile-less callers. Dropping it blindly would have opened every staff RPC
-- to any authenticated user. The guards below use exists()-based helpers that
-- return true/false and never null.
--
-- `organizations` becomes `company_profile`, a single row holding the company
-- name, timezone, booking deposit percent and payment instructions -- all of
-- which the booking flow and settings screen genuinely use.
--
-- Storage objects keep their existing `<old-org-uuid>/<rental-id>/...` paths.
-- The policies simply stop reading segment 1, so no object has to be moved;
-- new uploads write `<rental-id>/...`. Migrating live objects would mean a
-- non-transactional copy of every photo, for no functional gain.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. Refuse to run if this database holds more than one real organization.
--    Dropping the column would silently merge two companies' books together.
-- ---------------------------------------------------------------------------
do $$
declare
  v_orgs integer;
  v_names text;
begin
  select count(*), string_agg(name, ', ' order by name)
  into v_orgs, v_names
  from public.organizations;

  if v_orgs > 1 then
    raise exception
      'Refusing to drop the organization dimension: % organizations exist (%). '
      'Single-tenant collapse would merge their vehicles, rentals and payments '
      'into one book. Remove the unused organizations first.',
      v_orgs, v_names
      using errcode = '22023';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. Null-safe authorization helpers.
--    private.is_org_staff() already exists and is org-free; these complete it.
-- ---------------------------------------------------------------------------
create or replace function private.is_org_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and p.role in ('owner', 'admin')
  )
$$;

-- Any active profile, customers included. Replaces the old
-- `current_organization_id() is null` test, which was true for exactly the
-- callers that had no active profile row.
create or replace function private.has_active_profile()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
  )
$$;

revoke all on function private.is_org_admin() from public, anon;
grant execute on function private.is_org_admin() to authenticated, service_role;
revoke all on function private.has_active_profile() from public, anon;
grant execute on function private.has_active_profile() to authenticated, service_role;

comment on function private.is_org_admin() is
  'True when the caller has an active owner/admin profile. Never null.';
comment on function private.has_active_profile() is
  'True when the caller has any active profile, customers included. Never null.';

-- ---------------------------------------------------------------------------
-- 2. organizations -> company_profile, pinned to a single row.
-- ---------------------------------------------------------------------------
alter table public.organizations rename to company_profile;

drop policy if exists organizations_select_own on public.company_profile;
drop policy if exists organizations_update_admin on public.company_profile;

-- Seed a row if this database somehow has none, so the singleton always reads.
insert into public.company_profile (name, slug)
select 'Zeke Car Rentals', 'zeke-car-rentals'
where not exists (select 1 from public.company_profile);

-- One row, forever: a partial unique index on a constant.
create unique index if not exists company_profile_singleton
  on public.company_profile ((true));

-- Any active profile, customers included -- matching the old
-- organizations_select_own. The booking flow shows customers the company name
-- and payment instructions from this row.
create policy company_profile_select_member
on public.company_profile for select to authenticated
using ((select private.has_active_profile()));

create policy company_profile_update_admin
on public.company_profile for update to authenticated
using ((select private.is_org_admin()));

comment on table public.company_profile is
  'The single company this deployment serves. Exactly one row (company_profile_singleton).';

-- ---------------------------------------------------------------------------
-- 3. Policies: same role tests, tenant test gone.
--
--    Child-table policies that reached through a parent row only to compare
--    the parent's organization_id collapse to the role test; the NOT NULL
--    foreign key already guarantees the parent exists.
-- ---------------------------------------------------------------------------

-- app_settings
drop policy if exists app_settings_delete_admin on public.app_settings;
create policy app_settings_delete_admin
on public.app_settings for delete to authenticated
using ((select private.is_org_admin()));
drop policy if exists app_settings_insert_admin on public.app_settings;
create policy app_settings_insert_admin
on public.app_settings for insert to authenticated
with check ((select private.is_org_admin()));
drop policy if exists app_settings_update_admin on public.app_settings;
create policy app_settings_update_admin
on public.app_settings for update to authenticated
using ((select private.is_org_admin()));

-- audit_logs
drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin
on public.audit_logs for select to authenticated
using ((select private.is_org_admin()));

-- customers
drop policy if exists customers_delete_staff on public.customers;
create policy customers_delete_staff
on public.customers for delete to authenticated
using ((select private.is_org_staff()));
drop policy if exists customers_insert_staff on public.customers;
create policy customers_insert_staff
on public.customers for insert to authenticated
with check ((select private.is_org_staff()));
drop policy if exists customers_select_organization on public.customers;
create policy customers_select_organization
on public.customers for select to authenticated
using ((select private.is_org_staff()));
drop policy if exists customers_update_staff on public.customers;
create policy customers_update_staff
on public.customers for update to authenticated
using ((select private.is_org_staff()));

-- drivers
drop policy if exists drivers_select_organization on public.drivers;
create policy drivers_select_organization
on public.drivers for select to authenticated
using ((select private.is_org_staff()));
drop policy if exists drivers_write_staff on public.drivers;
create policy drivers_write_staff
on public.drivers for all to authenticated
using ((select private.is_org_staff())) with check ((select private.is_org_staff()));

-- geofences
drop policy if exists geofences_delete_admin on public.geofences;
create policy geofences_delete_admin
on public.geofences for delete to authenticated
using ((select private.is_org_admin()));
drop policy if exists geofences_insert_admin on public.geofences;
create policy geofences_insert_admin
on public.geofences for insert to authenticated
with check ((select private.is_org_admin()));
drop policy if exists geofences_select_organization on public.geofences;
create policy geofences_select_organization
on public.geofences for select to authenticated
using ((select private.is_org_staff()));
drop policy if exists geofences_update_admin on public.geofences;
create policy geofences_update_admin
on public.geofences for update to authenticated
using ((select private.is_org_admin()));

-- gps_devices
drop policy if exists gps_devices_delete_admin on public.gps_devices;
create policy gps_devices_delete_admin
on public.gps_devices for delete to authenticated
using ((select private.is_org_admin()));
drop policy if exists gps_devices_insert_admin on public.gps_devices;
create policy gps_devices_insert_admin
on public.gps_devices for insert to authenticated
with check ((select private.is_org_admin()));
drop policy if exists gps_devices_select_organization on public.gps_devices;
create policy gps_devices_select_organization
on public.gps_devices for select to authenticated
using ((select private.is_org_staff()));
drop policy if exists gps_devices_update_admin on public.gps_devices;
create policy gps_devices_update_admin
on public.gps_devices for update to authenticated
using ((select private.is_org_admin()));

-- inspection_checklist_template_items
drop policy if exists inspection_template_items_select_org on public.inspection_checklist_template_items;
create policy inspection_template_items_select_org
on public.inspection_checklist_template_items for select to authenticated
using ((select private.is_org_staff()));
drop policy if exists inspection_template_items_write_admin on public.inspection_checklist_template_items;
create policy inspection_template_items_write_admin
on public.inspection_checklist_template_items for all to authenticated
using ((select private.is_org_admin())) with check ((select private.is_org_admin()));

-- inspection_checklist_templates
drop policy if exists inspection_templates_select_org on public.inspection_checklist_templates;
create policy inspection_templates_select_org
on public.inspection_checklist_templates for select to authenticated
using ((select private.is_org_staff()));
drop policy if exists inspection_templates_write_admin on public.inspection_checklist_templates;
create policy inspection_templates_write_admin
on public.inspection_checklist_templates for all to authenticated
using ((select private.is_org_admin())) with check ((select private.is_org_admin()));

-- integration_sync_logs
drop policy if exists integration_sync_logs_select_organization on public.integration_sync_logs;
create policy integration_sync_logs_select_organization
on public.integration_sync_logs for select to authenticated
using ((select private.is_org_staff()));

-- notification_preferences
drop policy if exists notification_preferences_delete on public.notification_preferences;
create policy notification_preferences_delete
on public.notification_preferences for delete to authenticated
using ((select private.is_org_admin()));
drop policy if exists notification_preferences_insert on public.notification_preferences;
create policy notification_preferences_insert
on public.notification_preferences for insert to authenticated
with check ((select private.is_org_admin()));
drop policy if exists notification_preferences_select on public.notification_preferences;
create policy notification_preferences_select
on public.notification_preferences for select to authenticated
using ((select private.is_org_admin()));
drop policy if exists notification_preferences_update on public.notification_preferences;
create policy notification_preferences_update
on public.notification_preferences for update to authenticated
using ((select private.is_org_admin()));

-- payments
drop policy if exists payments_delete_admin on public.payments;
create policy payments_delete_admin
on public.payments for delete to authenticated
using ((select private.is_org_admin()));
drop policy if exists payments_insert_admin on public.payments;
create policy payments_insert_admin
on public.payments for insert to authenticated
with check ((select private.is_org_staff()));
drop policy if exists payments_select_org on public.payments;
create policy payments_select_org
on public.payments for select to authenticated
using ((select private.is_org_staff()));
drop policy if exists payments_update_admin on public.payments;
create policy payments_update_admin
on public.payments for update to authenticated
using ((select private.is_org_staff()));

-- profiles
drop policy if exists profiles_insert_admin on public.profiles;
create policy profiles_insert_admin
on public.profiles for insert to authenticated
with check ((select private.is_org_admin()));
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin
on public.profiles for update to authenticated
using ((select private.is_org_admin()));

-- rental_geofences
drop policy if exists rental_geofences_delete_staff on public.rental_geofences;
create policy rental_geofences_delete_staff
on public.rental_geofences for delete to authenticated
using ((select private.is_org_staff()));
drop policy if exists rental_geofences_insert_staff on public.rental_geofences;
create policy rental_geofences_insert_staff
on public.rental_geofences for insert to authenticated
with check ((select private.is_org_staff()));
drop policy if exists rental_geofences_select_organization on public.rental_geofences;
create policy rental_geofences_select_organization
on public.rental_geofences for select to authenticated
using ((select private.is_org_staff()));
drop policy if exists rental_geofences_update_staff on public.rental_geofences;
create policy rental_geofences_update_staff
on public.rental_geofences for update to authenticated
using ((select private.is_org_staff()));

-- rental_inspection_items
drop policy if exists rental_inspection_items_select_org on public.rental_inspection_items;
create policy rental_inspection_items_select_org
on public.rental_inspection_items for select to authenticated
using ((select private.is_org_staff()));
drop policy if exists rental_inspection_items_write_staff on public.rental_inspection_items;
create policy rental_inspection_items_write_staff
on public.rental_inspection_items for all to authenticated
using ((select private.is_org_staff())) with check ((select private.is_org_staff()));

-- rental_inspection_photos
drop policy if exists rental_inspection_photos_select_org on public.rental_inspection_photos;
create policy rental_inspection_photos_select_org
on public.rental_inspection_photos for select to authenticated
using ((select private.is_org_staff()));
drop policy if exists rental_inspection_photos_write_staff on public.rental_inspection_photos;
create policy rental_inspection_photos_write_staff
on public.rental_inspection_photos for all to authenticated
using ((select private.is_org_staff())) with check ((select private.is_org_staff()));

-- rental_inspections
drop policy if exists rental_inspections_select_org on public.rental_inspections;
create policy rental_inspections_select_org
on public.rental_inspections for select to authenticated
using ((select private.is_org_staff()));
drop policy if exists rental_inspections_write_staff on public.rental_inspections;
create policy rental_inspections_write_staff
on public.rental_inspections for all to authenticated
using ((select private.is_org_staff())) with check ((select private.is_org_staff()));

-- rentals
drop policy if exists rentals_delete_staff on public.rentals;
create policy rentals_delete_staff
on public.rentals for delete to authenticated
using ((select private.is_org_staff()));
drop policy if exists rentals_insert_staff on public.rentals;
create policy rentals_insert_staff
on public.rentals for insert to authenticated
with check ((select private.is_org_staff()));
drop policy if exists rentals_select_organization on public.rentals;
create policy rentals_select_organization
on public.rentals for select to authenticated
using ((select private.is_org_staff()));
drop policy if exists rentals_update_staff on public.rentals;
create policy rentals_update_staff
on public.rentals for update to authenticated
using ((select private.is_org_staff()));

-- tracking_events
drop policy if exists tracking_events_select_organization on public.tracking_events;
create policy tracking_events_select_organization
on public.tracking_events for select to authenticated
using ((select private.is_org_staff()));

-- vehicle_geofences
drop policy if exists vehicle_geofences_delete_admin on public.vehicle_geofences;
create policy vehicle_geofences_delete_admin
on public.vehicle_geofences for delete to authenticated
using ((select private.is_org_admin()));
drop policy if exists vehicle_geofences_insert_admin on public.vehicle_geofences;
create policy vehicle_geofences_insert_admin
on public.vehicle_geofences for insert to authenticated
with check ((select private.is_org_admin()));
drop policy if exists vehicle_geofences_select_organization on public.vehicle_geofences;
create policy vehicle_geofences_select_organization
on public.vehicle_geofences for select to authenticated
using ((select private.is_org_staff()));
drop policy if exists vehicle_geofences_update_admin on public.vehicle_geofences;
create policy vehicle_geofences_update_admin
on public.vehicle_geofences for update to authenticated
using ((select private.is_org_admin()));

-- vehicle_known_damages
drop policy if exists vehicle_known_damages_select_org on public.vehicle_known_damages;
create policy vehicle_known_damages_select_org
on public.vehicle_known_damages for select to authenticated
using ((select private.is_org_staff()));
drop policy if exists vehicle_known_damages_write_staff on public.vehicle_known_damages;
create policy vehicle_known_damages_write_staff
on public.vehicle_known_damages for all to authenticated
using ((select private.is_org_staff())) with check ((select private.is_org_staff()));

-- vehicle_latest_locations
drop policy if exists vehicle_latest_locations_select_organization on public.vehicle_latest_locations;
create policy vehicle_latest_locations_select_organization
on public.vehicle_latest_locations for select to authenticated
using ((select private.is_org_staff()));

-- vehicle_location_history
drop policy if exists vehicle_location_history_select_organization on public.vehicle_location_history;
create policy vehicle_location_history_select_organization
on public.vehicle_location_history for select to authenticated
using ((select private.is_org_staff()));

-- vehicle_photos
drop policy if exists vehicle_photos_write_admin on public.vehicle_photos;
create policy vehicle_photos_write_admin
on public.vehicle_photos for all to authenticated
using ((select private.is_org_admin())) with check ((select private.is_org_admin()));

-- vehicles
drop policy if exists vehicles_delete_admin on public.vehicles;
create policy vehicles_delete_admin
on public.vehicles for delete to authenticated
using ((select private.is_org_admin()));
drop policy if exists vehicles_insert_admin on public.vehicles;
create policy vehicles_insert_admin
on public.vehicles for insert to authenticated
with check ((select private.is_org_admin()));
drop policy if exists vehicles_select_organization on public.vehicles;
create policy vehicles_select_organization
on public.vehicles for select to authenticated
using ((select private.is_org_staff()));
drop policy if exists vehicles_update_admin on public.vehicles;
create policy vehicles_update_admin
on public.vehicles for update to authenticated
using ((select private.is_org_admin()));

-- profiles: your own row, or any row if you are staff.
drop policy if exists profiles_select_self_or_staff on public.profiles;
create policy profiles_select_self_or_staff
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or (select private.is_org_staff())
);

-- app_settings: admins see everything, staff see only non-sensitive keys.
drop policy if exists app_settings_select_safe on public.app_settings;
create policy app_settings_select_safe
on public.app_settings for select to authenticated
using (
  (select private.is_org_admin())
  or ((not is_sensitive) and (select private.is_org_staff()))
);
-- ---------------------------------------------------------------------------
-- 5. Functions whose whole purpose was the organization concept.
-- ---------------------------------------------------------------------------

-- The audit log no longer needs to be told which tenant it belongs to.
drop function if exists private.write_audit_log(uuid, text, text, uuid, jsonb, jsonb, jsonb);

create or replace function private.write_audit_log(
  p_action text,
  p_resource_type text,
  p_resource_id uuid,
  p_old_data jsonb default null,
  p_new_data jsonb default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (
    actor_profile_id, action, resource_type, resource_id,
    old_data, new_data, metadata
  ) values (
    (select auth.uid()), p_action, p_resource_type, p_resource_id,
    p_old_data, p_new_data, coalesce(p_metadata, '{}'::jsonb)
  )
$$;

revoke all on function private.write_audit_log(text, text, uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Public storefront reads. These now gate on the single company_profile row,
-- which is what finally fixes the cross-tenant leak the old version had: it
-- joined every organization with show_on_public_site set, so a second company
-- would have had its cars listed on this storefront.
-- ---------------------------------------------------------------------------
create or replace function public.list_public_available_vehicles(
  p_start_date date default null,
  p_end_date date default null
)
returns table (
  id uuid, name text, make text, model text, year smallint, category text,
  transmission public.vehicle_transmission, fuel_type public.vehicle_fuel_type,
  seating_capacity smallint, photo_url text, daily_rate numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    v.id, v.name, v.make, v.model, v.year, v.category,
    v.transmission, v.fuel_type, v.seating_capacity, v.photo_url, v.daily_rate
  from public.vehicles v
  cross join public.company_profile o
  where o.is_active
    and o.show_on_public_site
    and v.status = 'available'
    and (
      p_start_date is null
      or p_end_date is null
      or p_end_date < p_start_date
      or not exists (
        select 1
        from public.rentals r
        where r.vehicle_id = v.id
          and r.status in ('reserved', 'active', 'overdue')
          and tstzrange(r.start_at, r.expected_return_at, '[)')
            && tstzrange(
              (p_start_date::timestamp at time zone 'Asia/Manila'),
              ((p_end_date + 1)::timestamp at time zone 'Asia/Manila'),
              '[)'
            )
      )
    )
  order by v.name asc, v.created_at asc;
$$;

create or replace function public.get_public_vehicle(p_vehicle_id uuid)
returns table (
  id uuid, name text, make text, model text, year smallint, category text,
  transmission public.vehicle_transmission, fuel_type public.vehicle_fuel_type,
  seating_capacity smallint, photo_url text, status public.vehicle_status,
  daily_rate numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    v.id, v.name, v.make, v.model, v.year, v.category, v.transmission,
    v.fuel_type, v.seating_capacity, v.photo_url, v.status, v.daily_rate
  from public.vehicles v
  cross join public.company_profile o
  where v.id = p_vehicle_id
    and o.is_active
    and o.show_on_public_site
    and v.status <> 'inactive';
$$;

create or replace function public.list_public_vehicle_booked_ranges(p_vehicle_id uuid)
returns table (
  start_at timestamptz,
  expected_return_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.start_at, r.expected_return_at
  from public.rentals r
  inner join public.vehicles v on v.id = r.vehicle_id
  cross join public.company_profile o
  where r.vehicle_id = p_vehicle_id
    and o.is_active
    and o.show_on_public_site
    and v.status <> 'inactive'
    and r.status in ('reserved', 'active', 'overdue')
    and r.expected_return_at > now()
  order by r.start_at asc;
$$;

-- ---------------------------------------------------------------------------
-- Self-service registration.
--
-- Multi-tenant, this RPC minted a NEW organization and made the caller its
-- admin -- safe, because it was their own tenant. Single-tenant there is no new
-- organization to mint, so the same code would hand admin over the one real
-- company to ANYONE who completed signup. It is now a bootstrap-only path:
-- it provisions the first admin and then permanently refuses.
-- ---------------------------------------------------------------------------
drop function if exists public.complete_self_service_registration(text, text);
drop function if exists private.complete_self_service_registration(text, text);

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
    raise exception
      'This workspace already has an administrator. Ask an owner to invite you.'
      using errcode = '42501';
  end if;

  insert into public.profiles (id, full_name, role, is_active)
  values (v_user_id, v_full_name, 'admin', true);

  return v_user_id;
end;
$$;

create or replace function public.complete_self_service_registration(p_full_name text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.complete_self_service_registration(p_full_name)
$$;

revoke all on function private.complete_self_service_registration(text)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_self_service_registration(text)
  from public, anon;
grant execute on function public.complete_self_service_registration(text) to authenticated;

comment on function public.complete_self_service_registration(text) is
  'Bootstrap only: provisions the first admin profile. Refuses once one exists.';

-- ---------------------------------------------------------------------------
-- Google customer auto-provisioning. The storefront gate moves to the
-- singleton; the ops-signup escape hatch now keys off `ops_registration`
-- metadata instead of `organization_name`.
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_auth_user_customer_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider text;
  v_full_name text;
begin
  -- Already provisioned (e.g. race with the RPC, or a pre-linked invite).
  if exists (select 1 from public.profiles p where p.id = new.id) then
    return new;
  end if;

  -- Ops self-service registration calls complete_self_service_registration
  -- after signup. Do not pre-create a customer row that would short-circuit it.
  if nullif(btrim(coalesce(new.raw_user_meta_data ->> 'ops_registration', '')), '')
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

  if not exists (
    select 1 from public.company_profile o
    where o.is_active and o.show_on_public_site
  ) then
    raise exception 'Public booking is not enabled.' using errcode = 'P0002';
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

  insert into public.profiles (id, full_name, role, is_active)
  values (new.id, v_full_name, 'customer', true);

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Inspection photo reads for customers. Legacy objects are
-- `<org>/<rental>/<file>` and new ones are `<rental>/<file>`, so match the
-- rental id in any path segment rather than at a fixed index.
-- ---------------------------------------------------------------------------
create or replace function private.customer_can_read_inspection_object(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rentals r
    join public.customers c on c.id = r.customer_id
    where r.id::text = any (storage.foldername(p_object_name))
      and nullif(btrim(coalesce(c.email, '')), '') is not null
      and nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), '') is not null
      and lower(btrim(c.email)) = lower(btrim(auth.jwt() ->> 'email'))
  )
$$;

-- ---------------------------------------------------------------------------
-- Company settings (was update_organization_settings).
-- ---------------------------------------------------------------------------
drop function if exists public.update_organization_settings(text, text, integer, integer, integer, text);
drop function if exists private.update_organization_settings_impl(text, text, integer, integer, integer, text);

create or replace function private.update_company_settings_impl(
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
  v_company_id uuid;
  v_old_data jsonb;
begin
  if not (select private.is_org_admin()) then
    raise exception 'Owner or admin access is required.'
      using errcode = 'insufficient_privilege';
  end if;
  if char_length(trim(p_name)) not between 2 and 120 then
    raise exception 'Company name must contain 2 to 120 characters.'
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

  select o.id, jsonb_build_object('name', o.name, 'timezone', o.timezone)
    into v_company_id, v_old_data
  from public.company_profile o
  for update;

  update public.company_profile
  set name = trim(p_name), timezone = p_timezone
  where id = v_company_id;

  insert into public.app_settings (
    setting_key, setting_value, description, is_sensitive
  ) values
    ('tracker.online_threshold_minutes',
      to_jsonb(p_online_threshold), 'Minutes before a tracker is no longer online.', false),
    ('tracker.delayed_threshold_minutes',
      to_jsonb(p_delayed_threshold), 'Minutes before a tracker is considered offline.', false),
    ('location.retention_days',
      to_jsonb(p_retention_days), 'Detailed location-history retention in days.', false),
    ('gps.provider',
      to_jsonb(p_gps_provider), 'Active normalized GPS provider.', false)
  on conflict (setting_key) do update set
    setting_value = excluded.setting_value,
    description = excluded.description,
    is_sensitive = false;

  perform private.write_audit_log(
    'company.settings_updated',
    'company_profile',
    v_company_id,
    v_old_data,
    jsonb_build_object(
      'name', trim(p_name), 'timezone', p_timezone,
      'online_threshold_minutes', p_online_threshold,
      'delayed_threshold_minutes', p_delayed_threshold,
      'retention_days', p_retention_days, 'gps_provider', p_gps_provider
    ),
    '{}'::jsonb
  );
  return v_company_id;
end;
$$;

create or replace function public.update_company_settings(
  p_name text,
  p_timezone text,
  p_online_threshold integer,
  p_delayed_threshold integer,
  p_retention_days integer,
  p_gps_provider text
)
returns uuid
language sql
set search_path = ''
as $$
  select private.update_company_settings_impl(
    p_name, p_timezone, p_online_threshold, p_delayed_threshold,
    p_retention_days, p_gps_provider
  )
$$;

revoke all on function private.update_company_settings_impl(
  text, text, integer, integer, integer, text
) from public, anon, authenticated, service_role;
revoke all on function public.update_company_settings(
  text, text, integer, integer, integer, text
) from public, anon;
grant execute on function public.update_company_settings(
  text, text, integer, integer, integer, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- 5b. Remaining functions: tenant predicates removed, logic untouched.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.acknowledge_tracking_event_impl(p_event_id uuid, p_resolution_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role public.app_role := private.current_app_role();
  v_event public.tracking_events%rowtype;
begin
  if not (select private.is_org_staff()) then
    raise exception 'Staff access is required.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_event
  from public.tracking_events e
  where e.id = p_event_id
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
$function$;

CREATE OR REPLACE FUNCTION private.assign_gps_device_impl(p_device_id uuid, p_vehicle_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_device public.gps_devices%rowtype;
begin
  if not (select private.is_org_admin()) then
    raise exception 'Owner or admin access is required.' using errcode = 'insufficient_privilege';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('gps-device-assignment', 0)
  );

  select * into v_device
  from public.gps_devices d
  where d.id = p_device_id
  for update;
  if not found then
    raise exception 'GPS device was not found.' using errcode = 'no_data_found';
  end if;

  if p_vehicle_id is not null then
    perform 1
    from public.vehicles v
    where v.id = p_vehicle_id
      and v.status <> 'inactive'
    for update;
    if not found then
      raise exception 'Active vehicle was not found.' using errcode = 'no_data_found';
    end if;

    update public.gps_devices
    set vehicle_id = null
      where vehicle_id = p_vehicle_id
      and is_active
      and id <> p_device_id;
  end if;

  update public.gps_devices
  set vehicle_id = p_vehicle_id
  where id = p_device_id;
  return p_device_id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.audit_device_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if old.vehicle_id is distinct from new.vehicle_id then
    perform private.write_audit_log(
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
$function$;

CREATE OR REPLACE FUNCTION private.ensure_default_inspection_template()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_template_id uuid;
begin
  select id into v_template_id
  from public.inspection_checklist_templates
    where is_default
    and is_active
  limit 1;

  if v_template_id is not null then
    return v_template_id;
  end if;

  insert into public.inspection_checklist_templates (
    name, vehicle_category, is_default, is_active
  )
  values ('Standard vehicle inspection', null, true, true)
  returning id into v_template_id;

  insert into public.inspection_checklist_template_items (
    template_id, area_code, label, item_group, body_map_zone, sort_order, is_required
  )
  select
    v_template_id,
    d.area_code,
    d.label,
    d.item_group,
    d.body_map_zone,
    d.sort_order,
    true
  from private.default_inspection_checklist_items() d;

  return v_template_id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.mark_overdue_rentals()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_count integer := 0;
begin

  -- Deliberately row-by-row, not a single bulk UPDATE. An active -> overdue
  -- update re-fires private.enforce_rental_booking_rules, which re-checks
  -- customers.is_blocked and the schedule. A customer blocked *after* pickup
  -- makes that one row raise, and in a bulk statement that would abort the
  -- whole sweep. Here a failing row is skipped and left active for staff to
  -- resolve; src/features/rentals/lib/overdue.ts still displays it as overdue.
  for v_id in
    select id
    from public.rentals
      where status = 'active'
      and expected_return_at < now()
    for update skip locked
  loop
    begin
      update public.rentals
      set status = 'overdue'
      where id = v_id
        and status = 'active';

      perform private.write_audit_log(
                'rental.marked_overdue',
        'rental',
        v_id,
        jsonb_build_object('status', 'active'),
        jsonb_build_object('status', 'overdue'),
        jsonb_build_object('source', 'sweep')
      );

      v_count := v_count + 1;
    exception
      when others then
        -- Blocked customer or schedule conflict: leave the rental active.
        continue;
    end;
  end loop;

  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION private.rental_schedule_conflict(p_vehicle_id uuid, p_start_at timestamp with time zone, p_expected_return_at timestamp with time zone, p_exclude_rental_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(rental_id uuid, reference_number text, status rental_status, start_at timestamp with time zone, expected_return_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    r.id,
    r.reference_number,
    r.status,
    r.start_at,
    r.expected_return_at
  from public.rentals r
    where r.vehicle_id = p_vehicle_id
    and r.status in ('reserved', 'active', 'overdue')
    and (p_exclude_rental_id is null or r.id <> p_exclude_rental_id)
    and tstzrange(r.start_at, r.expected_return_at, '[)')
      && tstzrange(p_start_at, p_expected_return_at, '[)')
  order by r.start_at
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION private.sync_vehicle_status_from_rental()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_next_status public.vehicle_status;
begin
  if new.status in ('active', 'overdue') then
    v_next_status := 'rented';
  elsif new.status = 'reserved' then
    v_next_status := 'reserved';
  elsif exists (
    select 1 from public.rentals r
      where r.vehicle_id = new.vehicle_id
      and r.id <> new.id
      and r.status in ('active', 'overdue')
  ) then
    v_next_status := 'rented';
  elsif exists (
    select 1 from public.rentals r
      where r.vehicle_id = new.vehicle_id
      and r.id <> new.id
      and r.status = 'reserved'
  ) then
    v_next_status := 'reserved';
  else
    v_next_status := 'available';
  end if;

  update public.vehicles
  set status = v_next_status
    where id = new.vehicle_id
    and status not in ('maintenance', 'inactive')
    and status is distinct from v_next_status;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.transition_rental_impl(p_rental_id uuid, p_status rental_status, p_actual_return_at timestamp with time zone, p_ending_odometer numeric, p_ending_fuel_level numeric, p_notes text, p_cancellation_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role public.app_role := private.current_app_role();
  v_reason text := nullif(lower(btrim(coalesce(p_cancellation_reason, ''))), '');
  v_new_data jsonb;
begin
  if not (select private.is_org_staff()) then
    raise exception 'Staff access is required.' using errcode = 'insufficient_privilege';
  end if;

  if v_reason is not null and v_reason not in (
    'customer_request', 'no_show', 'payment_not_received',
    'vehicle_unavailable', 'duplicate', 'other'
  ) then
    raise exception 'Invalid cancellation reason: %.', p_cancellation_reason
      using errcode = '22023';
  end if;

  perform 1 from public.rentals r
  where r.id = p_rental_id
  for update;
  if not found then
    raise exception 'Rental was not found.' using errcode = 'no_data_found';
  end if;

  if p_status = 'active'
    and not exists (
      select 1 from public.rental_inspections i
      where i.rental_id = p_rental_id
        and i.inspection_type = 'pickup'
    ) then
    raise exception
      'Complete a pickup inspection before starting this rental.'
      using errcode = 'check_violation';
  end if;

  if p_status = 'completed'
    and not exists (
      select 1 from public.rental_inspections i
      where i.rental_id = p_rental_id
        and i.inspection_type = 'return'
    ) then
    raise exception
      'Complete a return inspection before completing this rental.'
      using errcode = 'check_violation';
  end if;

  update public.rentals
  set status = p_status,
      actual_return_at = case
        when p_status = 'completed' then coalesce(p_actual_return_at, now())
        else actual_return_at
      end,
      ending_odometer = coalesce(p_ending_odometer, ending_odometer),
      ending_fuel_level = coalesce(p_ending_fuel_level, ending_fuel_level),
      notes = coalesce(p_notes, notes),
      cancellation_reason = case
        when p_status = 'cancelled' then v_reason
        else cancellation_reason
      end
  where id = p_rental_id;

  v_new_data := jsonb_build_object('status', p_status);
  if p_status = 'cancelled' then
    v_new_data := v_new_data || jsonb_build_object('cancellation_reason', v_reason);
  end if;

  perform private.write_audit_log(
    'rental.transitioned',
    'rental',
    p_rental_id,
    null,
    v_new_data,
    '{}'::jsonb
  );
  return p_rental_id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.validate_rental_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_customer_blocked boolean;
  v_customer_consent timestamptz;
  v_vehicle_status public.vehicle_status;
  v_conflict record;
begin
  if new.expected_return_at <= new.start_at then
    raise exception 'Expected return must be after the rental start.'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' then
    if old.status <> 'draft' and (
      new.customer_id is distinct from old.customer_id
      or new.vehicle_id is distinct from old.vehicle_id
    ) then
      raise exception 'Customer and vehicle cannot change after a rental leaves draft.'
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

    if old.status in ('completed', 'cancelled') and (
      new.customer_id is distinct from old.customer_id
      or new.vehicle_id is distinct from old.vehicle_id
      or new.start_at is distinct from old.start_at
      or new.expected_return_at is distinct from old.expected_return_at
      or new.status is distinct from old.status
    ) then
      raise exception 'Completed or cancelled rentals cannot change vehicle, customer, schedule, or status.'
        using errcode = 'check_violation';
    end if;
  end if;

  -- Lock the vehicle row so concurrent booking attempts serialize on the same car.
  if new.status in ('draft', 'reserved', 'active', 'overdue') then
    select v.status into v_vehicle_status
    from public.vehicles v
    where v.id = new.vehicle_id
    for update;

    if v_vehicle_status is null then
      raise exception 'The selected vehicle was not found.'
        using errcode = 'foreign_key_violation';
    end if;

    if v_vehicle_status in ('maintenance', 'inactive') then
      raise exception
        'Vehicle is % and cannot be booked. Choose an available vehicle.',
        v_vehicle_status
        using errcode = 'check_violation';
    end if;

    -- Treat legacy reserved/rented vehicle rows as bookable (schedule is source of truth).
    -- New writes of those statuses are blocked by guard_vehicle_availability.

    select * into v_conflict
    from private.rental_schedule_conflict(new.vehicle_id,
      new.start_at,
      new.expected_return_at,
      case when tg_op = 'UPDATE' then new.id else null end
    );

    if found then
      raise exception
        'This vehicle is already booked (% · %) from % to %. Pick another car or different dates.',
        v_conflict.reference_number,
        v_conflict.status,
        v_conflict.start_at,
        v_conflict.expected_return_at
        using errcode = 'exclusion_violation';
    end if;
  end if;

  if new.status in ('reserved', 'active', 'overdue') then
    select c.is_blocked, c.tracking_consent_at
      into v_customer_blocked, v_customer_consent
    from public.customers c
    where c.id = new.customer_id
    for update;

    if coalesce(v_customer_blocked, true) then
      raise exception 'Blocked customers cannot reserve or start rentals.'
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
$function$;

CREATE OR REPLACE FUNCTION public.analytics_overview(p_from date, p_to date)
 RETURNS TABLE(bookings_created integer, bookings_public integer, bookings_ops integer, drafts_open integer, cancellations integer, completed_rentals integer, late_returns integer, overdue_now integer, collected numeric, refunds numeric, penalties_billed numeric, outstanding_balance numeric, rented_vehicle_days integer, fleet_vehicle_days integer, avg_rental_days numeric, avg_lead_time_days numeric, customers_total integer, customers_blocked integer, customers_active integer, customers_new integer, customers_returning integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_from timestamptz;
  v_to timestamptz;
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_bookings_created integer;
  v_bookings_public integer;
  v_bookings_ops integer;
  v_drafts_open integer;
  v_cancellations integer;
  v_completed integer;
  v_late integer;
  v_overdue_now integer;
  v_collected numeric;
  v_refunds numeric;
  v_penalties numeric;
  v_outstanding numeric;
  v_rented_days integer;
  v_fleet_days integer;
  v_avg_rental_days numeric;
  v_avg_lead_days numeric;
  v_customers_total integer;
  v_customers_blocked integer;
  v_customers_active integer;
  v_customers_new integer;
begin
  if private.current_app_role() is null
    or private.current_app_role() not in ('owner', 'admin') then
    raise exception 'Analytics are available to owners and admins only.'
      using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Invalid analytics window.' using errcode = '22023';
  end if;
  if (p_to - p_from + 1) > 400 then
    raise exception 'Analytics window cannot exceed 400 days.' using errcode = '22023';
  end if;

  v_from := p_from::timestamp at time zone 'Asia/Manila';
  v_to := (p_to + 1)::timestamp at time zone 'Asia/Manila';

  select
    count(*)::integer,
    (count(*) filter (where r.booking_source = 'public_web'))::integer,
    (count(*) filter (where r.booking_source = 'ops'))::integer,
    (count(*) filter (where r.status = 'draft'))::integer
  into v_bookings_created, v_bookings_public, v_bookings_ops, v_drafts_open
  from public.rentals r
    where r.created_at >= v_from
    and r.created_at < v_to;

  select count(*)::integer
  into v_cancellations
  from public.rentals r
    where r.status = 'cancelled'
    and r.cancelled_at >= v_from
    and r.cancelled_at < v_to;

  select
    count(*)::integer,
    (count(*) filter (
      where r.actual_return_at > r.expected_return_at + interval '1 hour'
    ))::integer
  into v_completed, v_late
  from public.rentals r
    where r.status = 'completed'
    and r.actual_return_at >= v_from
    and r.actual_return_at < v_to;

  select count(*)::integer
  into v_overdue_now
  from public.rentals r
    where (
      r.status = 'overdue'
      or (r.status = 'active' and r.expected_return_at < now())
    );

  select
    coalesce(sum(case
      when p.payment_type in ('deposit', 'balance', 'adjustment') then p.amount
      when p.payment_type = 'refund' then -p.amount
      else 0
    end), 0),
    coalesce(sum(p.amount) filter (where p.payment_type = 'refund'), 0),
    coalesce(sum(p.amount) filter (where p.payment_type = 'penalty'), 0)
  into v_collected, v_refunds, v_penalties
  from public.payments p
    where p.status = 'confirmed'
    and p.confirmed_at >= v_from
    and p.confirmed_at < v_to;

  select coalesce(sum(greatest(
    0,
    coalesce(r.quoted_total, 0) + coalesce(led.penalties, 0) - coalesce(led.credits, 0)
  )), 0)
  into v_outstanding
  from public.rentals r
  left join lateral (
    select
      sum(case
        when p.payment_type in ('deposit', 'balance', 'adjustment') then p.amount
        when p.payment_type = 'refund' then -p.amount
        else 0
      end) as credits,
      sum(p.amount) filter (where p.payment_type = 'penalty') as penalties
    from public.payments p
      where p.rental_id = r.id
      and p.status = 'confirmed'
  ) led on true
    where r.status in ('active', 'overdue', 'completed');

  select
    coalesce(sum(private.analytics_rented_days(
      r.start_at,
      private.analytics_occupied_end(r.status, r.expected_return_at, r.actual_return_at),
      v_from,
      v_to
    )), 0)::integer
  into v_rented_days
  from public.rentals r
    where r.status in ('reserved', 'active', 'overdue', 'completed')
    and r.start_at < v_to;

  -- Fleet capacity counts only days up to today; future days are not capacity
  -- that was available to sell yet.
  select coalesce(sum((
    select count(*)
    from public.vehicles v
      where v.status <> 'inactive'
      and v.created_at < ((d.day + 1)::timestamp at time zone 'Asia/Manila')
  )), 0)::integer
  into v_fleet_days
  from (
    select gs::date as day
    from generate_series(
      p_from::timestamp,
      least(p_to, v_today)::timestamp,
      interval '1 day'
    ) gs
  ) d;

  select round(avg(
    extract(epoch from (
      private.analytics_occupied_end(r.status, r.expected_return_at, r.actual_return_at)
      - r.start_at
    )) / 86400.0
  ), 1)
  into v_avg_rental_days
  from public.rentals r
    where r.status in ('reserved', 'active', 'overdue', 'completed')
    and r.start_at >= v_from
    and r.start_at < v_to;

  select round(avg(extract(epoch from (r.start_at - r.created_at)) / 86400.0), 1)
  into v_avg_lead_days
  from public.rentals r
    where r.status not in ('draft', 'cancelled')
    and r.created_at >= v_from
    and r.created_at < v_to;

  select
    count(*)::integer,
    (count(*) filter (where c.is_blocked))::integer
  into v_customers_total, v_customers_blocked
  from public.customers c;

  with active as (
    select distinct r.customer_id
    from public.rentals r
      where r.status in ('reserved', 'active', 'overdue', 'completed')
      and r.start_at >= v_from
      and r.start_at < v_to
  ),
  first_rental as (
    select r.customer_id, min(r.start_at) as first_start_at
    from public.rentals r
    join active a on a.customer_id = r.customer_id
      where r.status in ('reserved', 'active', 'overdue', 'completed')
    group by r.customer_id
  )
  select
    (select count(*) from active)::integer,
    (select count(*) from first_rental f where f.first_start_at >= v_from)::integer
  into v_customers_active, v_customers_new;

  return query
  select
    v_bookings_created,
    v_bookings_public,
    v_bookings_ops,
    v_drafts_open,
    v_cancellations,
    v_completed,
    v_late,
    v_overdue_now,
    round(v_collected, 2),
    round(v_refunds, 2),
    round(v_penalties, 2),
    round(v_outstanding, 2),
    v_rented_days,
    v_fleet_days,
    v_avg_rental_days,
    v_avg_lead_days,
    v_customers_total,
    v_customers_blocked,
    v_customers_active,
    v_customers_new,
    v_customers_active - v_customers_new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.analytics_timeseries(p_from date, p_to date, p_bucket text DEFAULT 'day'::text)
 RETURNS TABLE(bucket_start date, collected numeric, penalties_billed numeric, bookings_created integer, bookings_public integer, cancellations integer, rented_vehicle_days integer, fleet_vehicle_days integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_from timestamptz;
  v_to timestamptz;
  v_bucket text := lower(btrim(coalesce(p_bucket, '')));
begin
  if private.current_app_role() is null
    or private.current_app_role() not in ('owner', 'admin') then
    raise exception 'Analytics are available to owners and admins only.'
      using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Invalid analytics window.' using errcode = '22023';
  end if;
  if (p_to - p_from + 1) > 400 then
    raise exception 'Analytics window cannot exceed 400 days.' using errcode = '22023';
  end if;
  if v_bucket not in ('day', 'week', 'month') then
    raise exception 'Bucket must be day, week, or month.' using errcode = '22023';
  end if;

  v_from := p_from::timestamp at time zone 'Asia/Manila';
  v_to := (p_to + 1)::timestamp at time zone 'Asia/Manila';

  return query
  with days as (
    select
      gs::date as day,
      (gs at time zone 'Asia/Manila') as day_start,
      ((gs + interval '1 day') at time zone 'Asia/Manila') as day_end,
      case v_bucket
        when 'day' then gs::date
        else date_trunc(v_bucket, gs)::date
      end as bucket
    from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') gs
  ),
  occ as (
    select
      r.vehicle_id,
      r.start_at,
      private.analytics_occupied_end(
        r.status, r.expected_return_at, r.actual_return_at
      ) as occ_end
    from public.rentals r
      where r.status in ('reserved', 'active', 'overdue', 'completed')
      and r.start_at < v_to
  ),
  pay as (
    select
      (p.confirmed_at at time zone 'Asia/Manila')::date as day,
      sum(case
        when p.payment_type in ('deposit', 'balance', 'adjustment') then p.amount
        when p.payment_type = 'refund' then -p.amount
        else 0
      end) as collected,
      coalesce(sum(p.amount) filter (where p.payment_type = 'penalty'), 0) as penalties
    from public.payments p
      where p.status = 'confirmed'
      and p.confirmed_at >= v_from
      and p.confirmed_at < v_to
    group by 1
  ),
  bk as (
    select
      (r.created_at at time zone 'Asia/Manila')::date as day,
      count(*) as created,
      count(*) filter (where r.booking_source = 'public_web') as public_created
    from public.rentals r
      where r.created_at >= v_from
      and r.created_at < v_to
    group by 1
  ),
  cx as (
    select
      (r.cancelled_at at time zone 'Asia/Manila')::date as day,
      count(*) as cancelled
    from public.rentals r
      where r.status = 'cancelled'
      and r.cancelled_at >= v_from
      and r.cancelled_at < v_to
    group by 1
  ),
  per_day as (
    select
      d.bucket,
      coalesce(pay.collected, 0) as collected,
      coalesce(pay.penalties, 0) as penalties,
      coalesce(bk.created, 0) as created,
      coalesce(bk.public_created, 0) as public_created,
      coalesce(cx.cancelled, 0) as cancelled,
      (
        select count(distinct o.vehicle_id)
        from occ o
        where o.start_at < d.day_end
          and o.occ_end > d.day_start
      ) as rented,
      (
        select count(*)
        from public.vehicles v
          where v.status <> 'inactive'
          and v.created_at < d.day_end
      ) as fleet
    from days d
    left join pay on pay.day = d.day
    left join bk on bk.day = d.day
    left join cx on cx.day = d.day
  )
  select
    pd.bucket,
    round(sum(pd.collected), 2),
    round(sum(pd.penalties), 2),
    sum(pd.created)::integer,
    sum(pd.public_created)::integer,
    sum(pd.cancelled)::integer,
    sum(pd.rented)::integer,
    sum(pd.fleet)::integer
  from per_day pd
  group by pd.bucket
  order by pd.bucket;
end;
$function$;

CREATE OR REPLACE FUNCTION public.analytics_top_customers(p_from date, p_to date, p_limit integer DEFAULT 10)
 RETURNS TABLE(customer_id uuid, full_name text, phone_number text, is_blocked boolean, rentals_in_window integer, rentals_lifetime integer, collected_in_window numeric, collected_lifetime numeric, outstanding numeric, late_returns_lifetime integer, first_rental_at timestamp with time zone, last_rental_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_from timestamptz;
  v_to timestamptz;
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 50);
begin
  if private.current_app_role() is null
    or private.current_app_role() not in ('owner', 'admin') then
    raise exception 'Analytics are available to owners and admins only.'
      using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Invalid analytics window.' using errcode = '22023';
  end if;
  if (p_to - p_from + 1) > 400 then
    raise exception 'Analytics window cannot exceed 400 days.' using errcode = '22023';
  end if;

  v_from := p_from::timestamp at time zone 'Asia/Manila';
  v_to := (p_to + 1)::timestamp at time zone 'Asia/Manila';

  return query
  with ledger as (
    select
      p.rental_id,
      sum(case
        when p.payment_type in ('deposit', 'balance', 'adjustment') then p.amount
        when p.payment_type = 'refund' then -p.amount
        else 0
      end) as credits_lifetime,
      coalesce(sum(case
        when p.payment_type in ('deposit', 'balance', 'adjustment') then p.amount
        when p.payment_type = 'refund' then -p.amount
        else 0
      end) filter (where p.confirmed_at >= v_from and p.confirmed_at < v_to), 0)
        as credits_in_window,
      coalesce(sum(p.amount) filter (where p.payment_type = 'penalty'), 0)
        as penalties_lifetime
    from public.payments p
      where p.status = 'confirmed'
    group by p.rental_id
  ),
  per_customer as (
    select
      r.customer_id,
      count(*) filter (
        where r.status in ('reserved', 'active', 'overdue', 'completed')
          and r.start_at >= v_from
          and r.start_at < v_to
      ) as rentals_in_window,
      count(*) filter (
        where r.status in ('reserved', 'active', 'overdue', 'completed')
      ) as rentals_lifetime,
      coalesce(sum(l.credits_in_window), 0) as collected_in_window,
      coalesce(sum(l.credits_lifetime), 0) as collected_lifetime,
      coalesce(sum(greatest(
        0,
        coalesce(r.quoted_total, 0)
          + coalesce(l.penalties_lifetime, 0)
          - coalesce(l.credits_lifetime, 0)
      )) filter (where r.status in ('active', 'overdue', 'completed')), 0) as outstanding,
      count(*) filter (
        where r.status = 'completed'
          and r.actual_return_at > r.expected_return_at + interval '1 hour'
      ) as late_returns_lifetime,
      min(r.start_at) filter (
        where r.status in ('reserved', 'active', 'overdue', 'completed')
      ) as first_rental_at,
      max(r.start_at) filter (
        where r.status in ('reserved', 'active', 'overdue', 'completed')
      ) as last_rental_at
    from public.rentals r
    left join ledger l on l.rental_id = r.id
    group by r.customer_id
  )
  select
    c.id,
    c.full_name,
    c.phone_number,
    c.is_blocked,
    pc.rentals_in_window::integer,
    pc.rentals_lifetime::integer,
    round(pc.collected_in_window, 2),
    round(pc.collected_lifetime, 2),
    round(pc.outstanding, 2),
    pc.late_returns_lifetime::integer,
    pc.first_rental_at,
    pc.last_rental_at
  from per_customer pc
  join public.customers c
    on c.id = pc.customer_id
  where pc.rentals_in_window > 0
     or pc.collected_in_window > 0
  order by
    pc.collected_in_window desc,
    pc.rentals_in_window desc,
    c.full_name asc
  limit v_limit;
end;
$function$;

CREATE OR REPLACE FUNCTION public.analytics_vehicle_performance(p_from date, p_to date)
 RETURNS TABLE(vehicle_id uuid, plate_number text, name text, category text, status text, daily_rate numeric, rental_count integer, rented_days integer, window_days integer, collected numeric, penalties_billed numeric, last_return_at timestamp with time zone, next_start_at timestamp with time zone, on_rent_now boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_from timestamptz;
  v_to timestamptz;
begin
  if private.current_app_role() is null
    or private.current_app_role() not in ('owner', 'admin') then
    raise exception 'Analytics are available to owners and admins only.'
      using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Invalid analytics window.' using errcode = '22023';
  end if;
  if (p_to - p_from + 1) > 400 then
    raise exception 'Analytics window cannot exceed 400 days.' using errcode = '22023';
  end if;

  v_from := p_from::timestamp at time zone 'Asia/Manila';
  v_to := (p_to + 1)::timestamp at time zone 'Asia/Manila';

  return query
  with occ as (
    select
      r.vehicle_id,
      private.analytics_rented_days(
        r.start_at,
        private.analytics_occupied_end(r.status, r.expected_return_at, r.actual_return_at),
        v_from,
        v_to
      ) as days_in_window
    from public.rentals r
      where r.status in ('reserved', 'active', 'overdue', 'completed')
      and r.start_at < v_to
      and private.analytics_occupied_end(
        r.status, r.expected_return_at, r.actual_return_at
      ) > v_from
  ),
  occ_agg as (
    select
      o.vehicle_id,
      count(*) as rental_count,
      sum(o.days_in_window) as rented_days
    from occ o
    group by o.vehicle_id
  ),
  pay_agg as (
    select
      r.vehicle_id,
      count(*) as payment_count,
      sum(case
        when p.payment_type in ('deposit', 'balance', 'adjustment') then p.amount
        when p.payment_type = 'refund' then -p.amount
        else 0
      end) as collected,
      coalesce(sum(p.amount) filter (where p.payment_type = 'penalty'), 0) as penalties
    from public.payments p
    join public.rentals r
      on r.id = p.rental_id
      where p.status = 'confirmed'
      and p.confirmed_at >= v_from
      and p.confirmed_at < v_to
    group by r.vehicle_id
  ),
  life as (
    select
      r.vehicle_id,
      max(r.actual_return_at) filter (
        where r.status = 'completed' and r.actual_return_at <= now()
      ) as last_return_at,
      min(r.start_at) filter (
        where r.status = 'reserved' and r.start_at > now()
      ) as next_start_at,
      bool_or(r.status in ('active', 'overdue')) as on_rent_now
    from public.rentals r
    group by r.vehicle_id
  )
  select
    v.id,
    v.plate_number,
    v.name,
    v.category,
    v.status::text,
    v.daily_rate,
    coalesce(oa.rental_count, 0)::integer,
    coalesce(oa.rented_days, 0)::integer,
    (p_to - p_from + 1)::integer,
    round(coalesce(pa.collected, 0), 2),
    round(coalesce(pa.penalties, 0), 2),
    l.last_return_at,
    l.next_start_at,
    coalesce(l.on_rent_now, false)
  from public.vehicles v
  left join occ_agg oa on oa.vehicle_id = v.id
  left join pay_agg pa on pa.vehicle_id = v.id
  left join life l on l.vehicle_id = v.id
    where (
      v.status <> 'inactive'
      or coalesce(oa.rental_count, 0) > 0
      or coalesce(pa.payment_count, 0) > 0
    )
  order by coalesce(pa.collected, 0) desc, v.plate_number asc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.check_vehicle_availability(p_vehicle_id uuid, p_start_at timestamp with time zone, p_expected_return_at timestamp with time zone, p_exclude_rental_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_vehicle_status public.vehicle_status;
  v_conflict record;
begin
  if not (select private.has_active_profile()) then
    raise exception 'Authentication is required.' using errcode = 'insufficient_privilege';
  end if;

  if p_expected_return_at <= p_start_at then
    return jsonb_build_object(
      'available', false,
      'reason', 'Expected return must be after the rental start.'
    );
  end if;

  select v.status into v_vehicle_status
  from public.vehicles v
  where v.id = p_vehicle_id;

  if v_vehicle_status is null then
    return jsonb_build_object(
      'available', false,
      'reason', 'Vehicle was not found.'
    );
  end if;

  if v_vehicle_status in ('maintenance', 'inactive') then
    return jsonb_build_object(
      'available', false,
      'reason', format('Vehicle is %s and cannot be booked.', v_vehicle_status),
      'vehicle_status', v_vehicle_status
    );
  end if;

  select * into v_conflict
  from private.rental_schedule_conflict(
    p_vehicle_id,
    p_start_at,
    p_expected_return_at,
    p_exclude_rental_id
  );

  if found then
    return jsonb_build_object(
      'available', false,
      'reason', format(
        'Vehicle is already booked (%s · %s) from %s to %s.',
        v_conflict.reference_number,
        v_conflict.status,
        v_conflict.start_at,
        v_conflict.expected_return_at
      ),
      'vehicle_status', v_vehicle_status,
      'conflict', jsonb_build_object(
        'id', v_conflict.rental_id,
        'reference_number', v_conflict.reference_number,
        'status', v_conflict.status,
        'start_at', v_conflict.start_at,
        'expected_return_at', v_conflict.expected_return_at
      )
    );
  end if;

  return jsonb_build_object(
    'available', true,
    'vehicle_status', v_vehicle_status
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.clone_inspection_template_for_category(p_vehicle_category text, p_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role public.app_role := private.current_app_role();
  v_source_id uuid;
  v_new_id uuid;
  v_category text := nullif(trim(p_vehicle_category), '');
begin
  if not (select private.is_org_admin()) then
    raise exception 'Admin access is required.' using errcode = 'insufficient_privilege';
  end if;
  if v_category is null then
    raise exception 'Vehicle category is required.';
  end if;

  v_source_id := private.ensure_default_inspection_template();

  insert into public.inspection_checklist_templates (
    name, vehicle_category, is_default, is_active
  )
  values (
    coalesce(nullif(trim(p_name), ''), v_category || ' inspection'),
    v_category,
    false,
    true
  )
  returning id into v_new_id;

  insert into public.inspection_checklist_template_items (
    template_id, area_code, label, item_group, body_map_zone, sort_order, is_required
  )
  select
    v_new_id,
    i.area_code,
    i.label,
    i.item_group,
    i.body_map_zone,
    i.sort_order,
    i.is_required
  from public.inspection_checklist_template_items i
  where i.template_id = v_source_id;

  return v_new_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_rental_deposit(p_rental_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role public.app_role := private.current_app_role();
  v_user_id uuid := auth.uid();
  v_rental record;
  v_payment_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  if v_role not in ('owner', 'admin', 'staff') then
    raise exception 'Staff access is required to confirm deposits.'
      using errcode = '42501';
  end if;
  if p_rental_id is null then
    raise exception 'Select a rental.' using errcode = '22023';
  end if;

  select
    r.id,
    r.status,
    r.payment_status,
    r.reference_number,
    r.deposit_amount
  into v_rental
  from public.rentals r
  where r.id = p_rental_id
  for update;

  if not found then
    raise exception 'Rental not found.' using errcode = 'P0002';
  end if;

  if v_rental.status not in ('draft', 'reserved') then
    raise exception 'Only draft or reserved rentals can confirm a deposit.'
      using errcode = 'P0001';
  end if;

  select p.id
  into v_payment_id
  from public.payments p
  where p.rental_id = v_rental.id
    and p.payment_type = 'deposit'
    and p.status = 'submitted'
  order by p.submitted_at desc
  limit 1
  for update;

  if v_payment_id is null then
    -- Allow confirming without a proof row only if staff explicitly confirms cash/offline.
    insert into public.payments (
      rental_id,
      payment_type,
      amount,
      currency,
      method,
      status,
      notes,
      submitted_at,
      confirmed_at,
      confirmed_by
    )
    values (
      v_rental.id,
      'deposit',
      greatest(coalesce(v_rental.deposit_amount, 0), 0.01),
      'PHP',
      'cash',
      'confirmed',
      'Deposit confirmed by staff without customer proof upload',
      now(),
      now(),
      v_user_id
    )
    returning id into v_payment_id;
  else
    update public.payments
    set
      status = 'confirmed',
      confirmed_at = now(),
      confirmed_by = v_user_id
    where id = v_payment_id;
  end if;

  update public.rentals
  set
    deposit_confirmed_at = now(),
    deposit_confirmed_by = v_user_id
  where id = v_rental.id;

  perform private.refresh_rental_payment_summary(v_rental.id);

  if v_rental.status = 'draft' then
    perform private.transition_rental_impl(
      v_rental.id,
      'reserved'::public.rental_status,
      null,
      null,
      null,
      null
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'rental_id', v_rental.id,
    'payment_id', v_payment_id,
    'reference_number', v_rental.reference_number,
    'status', 'reserved',
    'payment_status', 'deposit_paid',
    'message', 'Deposit confirmed. Booking is now reserved.'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_public_booking(p_vehicle_id uuid, p_start_at timestamp with time zone, p_expected_return_at timestamp with time zone, p_full_name text, p_phone_number text, p_email text, p_drivers_license_number text, p_pickup_location text DEFAULT NULL::text, p_return_location text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_vehicle_status public.vehicle_status;
  v_vehicle_name text;
  v_daily_rate numeric(12, 2);
  v_deposit_percent numeric(5, 2);
  v_days integer;
  v_quoted_total numeric(12, 2);
  v_deposit_amount numeric(12, 2);
  v_balance_due numeric(12, 2);
  v_conflict record;
  v_customer_id uuid;
  v_existing public.customers%rowtype;
  v_contact_note text;
  v_full_name text := btrim(coalesce(p_full_name, ''));
  v_phone text := btrim(coalesce(p_phone_number, ''));
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_license text := btrim(coalesce(p_drivers_license_number, ''));
  v_pickup text := nullif(btrim(coalesce(p_pickup_location, '')), '');
  v_return text := nullif(btrim(coalesce(p_return_location, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_rental_notes text;
  v_reference text;
  v_rental_id uuid;
  v_auth_uid uuid := auth.uid();
  v_auth_email text;
begin
  if p_vehicle_id is null then
    raise exception 'Select a vehicle to book.' using errcode = '22023';
  end if;
  if p_start_at is null or p_expected_return_at is null then
    raise exception 'Pick-up and return dates are required.' using errcode = '22023';
  end if;
  if p_expected_return_at <= p_start_at then
    raise exception 'Return must be after pick-up.' using errcode = '22023';
  end if;
  if p_start_at < (now() - interval '1 hour') then
    raise exception 'Pick-up must be in the future.' using errcode = '22023';
  end if;
  if char_length(v_full_name) not between 2 and 120 then
    raise exception 'Enter your full name.' using errcode = '22023';
  end if;
  if char_length(v_phone) not between 7 and 40 then
    raise exception 'Enter a valid phone number.' using errcode = '22023';
  end if;
  if char_length(v_license) not between 3 and 80 then
    raise exception 'Enter your driver license number.' using errcode = '22023';
  end if;

  -- Signed-in customers: the verified auth email is the booking email.
  if v_auth_uid is not null then
    select nullif(lower(btrim(u.email)), '')
    into v_auth_email
    from auth.users u
    where u.id = v_auth_uid;

    if v_auth_email is not null then
      v_email := v_auth_email;
    end if;
  end if;

  if v_email is not null and v_email !~ '^[^@]+@[^@]+\.[^@]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;

  select
        v.status,
    v.name,
    v.daily_rate,
    o.deposit_percent
  into
    v_vehicle_status,
    v_vehicle_name,
    v_daily_rate,
    v_deposit_percent
  from public.vehicles v
  cross join public.company_profile o
  where v.id = p_vehicle_id
    and o.is_active
    and o.show_on_public_site
  for update of v;

  if v_vehicle_status is null then
    raise exception 'This vehicle is not available for online booking.'
      using errcode = 'P0002';
  end if;

  if v_vehicle_status in ('maintenance', 'inactive') then
    raise exception 'This vehicle is not available right now. Choose another car.'
      using errcode = 'P0001';
  end if;

  if v_daily_rate is null or v_daily_rate <= 0 then
    raise exception 'This vehicle does not have a rental rate yet. Please contact support.'
      using errcode = 'P0001';
  end if;

  v_days := greatest(
    1,
    (
      (timezone('Asia/Manila', p_expected_return_at))::date
      - (timezone('Asia/Manila', p_start_at))::date
    ) + 1
  );
  v_quoted_total := round(v_daily_rate * v_days, 2);
  v_deposit_amount := round(v_quoted_total * (v_deposit_percent / 100.0), 2);
  v_balance_due := round(v_quoted_total - v_deposit_amount, 2);

  select * into v_conflict
  from private.rental_schedule_conflict(
    p_vehicle_id,
    p_start_at,
    p_expected_return_at,
    null
  );

  if found then
    raise exception
      'Those dates are already booked for this car. Pick different dates or another vehicle.'
      using errcode = 'P0001';
  end if;

  select c.*
  into v_existing
  from public.customers c
    where (
      (v_email is not null and lower(btrim(coalesce(c.email, ''))) = v_email)
      or lower(btrim(c.drivers_license_number)) = lower(v_license)
      or btrim(c.phone_number) = v_phone
    )
  order by
    case
      when v_email is not null
        and lower(btrim(coalesce(c.email, ''))) = v_email then 0
      else 1
    end,
    c.created_at asc
  limit 1
  for update;

  if v_existing.id is null then
    insert into public.customers (
      full_name,
      phone_number,
      email,
      drivers_license_number,
      notes
    )
    values (
      v_full_name,
      v_phone,
      v_email,
      v_license,
      'Created from public web booking'
    )
    returning id into v_customer_id;
  else
    v_customer_id := v_existing.id;

    if v_existing.is_blocked then
      raise exception 'Your customer profile cannot book right now. Please contact support.'
        using errcode = 'P0001';
    end if;

    -- Never rewrite the matched customer's identity from an unauthenticated
    -- payload. Record any differences on the rental for staff to reconcile.
    if lower(btrim(v_existing.full_name)) is distinct from lower(v_full_name)
      or btrim(v_existing.phone_number) is distinct from v_phone
      or (
        v_email is not null
        and nullif(lower(btrim(coalesce(v_existing.email, ''))), '') is distinct from v_email
      )
      or lower(btrim(v_existing.drivers_license_number)) is distinct from lower(v_license)
    then
      v_contact_note :=
        'Contact details supplied at booking (differ from customer record; not applied): '
        || 'name: ' || v_full_name
        || '; phone: ' || v_phone
        || '; email: ' || coalesce(v_email, '(none)')
        || '; license: ' || v_license;
    end if;
  end if;

  if exists (
    select 1
    from public.customers c
    where c.id = v_customer_id
      and c.is_blocked
  ) then
    raise exception 'Your account cannot place bookings. Please contact support.'
      using errcode = 'P0001';
  end if;

  v_rental_notes := coalesce(v_notes, 'Booked online by customer — awaiting deposit');
  if v_contact_note is not null then
    v_rental_notes := v_rental_notes || E'\n' || v_contact_note;
  end if;

  v_reference :=
    'WEB-'
    || to_char(timezone('Asia/Manila', now()), 'YYMMDD')
    || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.rentals (
    reference_number,
    customer_id,
    vehicle_id,
    start_at,
    expected_return_at,
    pickup_location,
    return_location,
    status,
    notes,
    quoted_daily_rate,
    quoted_days,
    quoted_total,
    deposit_percent,
    deposit_amount,
    balance_due,
    payment_status,
    booking_source
  )
  values (
    v_reference,
    v_customer_id,
    p_vehicle_id,
    p_start_at,
    p_expected_return_at,
    v_pickup,
    coalesce(v_return, v_pickup),
    'draft',
    v_rental_notes,
    v_daily_rate,
    v_days,
    v_quoted_total,
    v_deposit_percent,
    v_deposit_amount,
    v_balance_due,
    'unpaid',
    'public_web'
  )
  returning id into v_rental_id;

  return jsonb_build_object(
    'success', true,
    'rental_id', v_rental_id,
    'reference_number', v_reference,
    'vehicle_id', p_vehicle_id,
    'vehicle_name', v_vehicle_name,
    'start_at', p_start_at,
    'expected_return_at', p_expected_return_at,
    'quoted_daily_rate', v_daily_rate,
    'quoted_days', v_days,
    'quoted_total', v_quoted_total,
    'deposit_percent', v_deposit_percent,
    'deposit_amount', v_deposit_amount,
    'balance_due', v_balance_due,
    'payment_status', 'unpaid',
    'message', 'Booking received. Pay the deposit and upload your proof to confirm.'
  );
exception
  when exclusion_violation then
    raise exception
      'Those dates are already booked for this car. Pick different dates or another vehicle.'
      using errcode = 'P0001';
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_booking_payment_details(p_rental_id uuid, p_reference_number text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ref text := btrim(coalesce(p_reference_number, ''));
  v_row record;
  v_deposit record;
begin
  if p_rental_id is null or char_length(v_ref) < 3 then
    raise exception 'Booking reference is required.' using errcode = '22023';
  end if;

  select
    r.id,
        r.reference_number,
    r.status,
    r.start_at,
    r.expected_return_at,
    r.quoted_daily_rate,
    r.quoted_days,
    r.quoted_total,
    r.deposit_percent,
    r.deposit_amount,
    r.balance_due,
    r.payment_status,
    v.name as vehicle_name,
    v.make as vehicle_make,
    v.model as vehicle_model,
    o.payment_qr_url,
    o.payment_instructions,
    o.name as company_name
  into v_row
  from public.rentals r
  inner join public.vehicles v
    on v.id = r.vehicle_id
  cross join public.company_profile o
  where r.id = p_rental_id
    and r.reference_number = v_ref
    and o.is_active
    and o.show_on_public_site;

  if not found then
    raise exception 'Booking not found. Check your reference number.'
      using errcode = 'P0002';
  end if;

  select
    p.id,
    p.external_reference,
    p.proof_path,
    p.submitted_at,
    p.status
  into v_deposit
  from public.payments p
  where p.rental_id = v_row.id
    and p.payment_type = 'deposit'
  order by
    case p.status
      when 'submitted' then 0
      when 'confirmed' then 1
      else 2
    end,
    p.submitted_at desc
  limit 1;

  return jsonb_build_object(
    'rental_id', v_row.id,
    'reference_number', v_row.reference_number,
    'status', v_row.status,
    'start_at', v_row.start_at,
    'expected_return_at', v_row.expected_return_at,
    'quoted_daily_rate', v_row.quoted_daily_rate,
    'quoted_days', v_row.quoted_days,
    'quoted_total', v_row.quoted_total,
    'deposit_percent', v_row.deposit_percent,
    'deposit_amount', v_row.deposit_amount,
    'balance_due', v_row.balance_due,
    'payment_status', v_row.payment_status,
    'payment_reference', v_deposit.external_reference,
    'has_payment_proof', v_deposit.proof_path is not null,
    'payment_proof_submitted_at', v_deposit.submitted_at,
    'deposit_payment_id', v_deposit.id,
    'deposit_payment_status', v_deposit.status,
    'vehicle_name', v_row.vehicle_name,
    'vehicle_make', v_row.vehicle_make,
    'vehicle_model', v_row.vehicle_model,
    'payment_qr_url', v_row.payment_qr_url,
    'payment_instructions', v_row.payment_instructions,
    'company_name', v_row.company_name
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_inspection_checklist_for_rental(p_rental_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role public.app_role := private.current_app_role();
  v_category text;
  v_template public.inspection_checklist_templates%rowtype;
begin
  if not (select private.is_org_staff()) then
    raise exception 'Staff access is required.' using errcode = 'insufficient_privilege';
  end if;

  select v.category into v_category
  from public.rentals r
  join public.vehicles v on v.id = r.vehicle_id
  where r.id = p_rental_id;

  if not found then
    raise exception 'Rental was not found.' using errcode = 'no_data_found';
  end if;

  perform private.ensure_default_inspection_template();

  if v_category is not null then
    select * into v_template
    from public.inspection_checklist_templates t
      where t.is_active
      and t.vehicle_category is not null
      and lower(t.vehicle_category) = lower(v_category)
    order by t.created_at desc
    limit 1;
  end if;

  if v_template.id is null then
    select * into v_template
    from public.inspection_checklist_templates t
      where t.is_active
      and t.is_default
    limit 1;
  end if;

  if v_template.id is null then
    raise exception 'No inspection checklist template is configured.';
  end if;

  return jsonb_build_object(
    'template_id', v_template.id,
    'name', v_template.name,
    'vehicle_category', v_template.vehicle_category,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'area_code', i.area_code,
          'label', i.label,
          'item_group', i.item_group,
          'body_map_zone', i.body_map_zone,
          'sort_order', i.sort_order,
          'is_required', i.is_required
        )
        order by i.sort_order, i.label
      )
      from public.inspection_checklist_template_items i
      where i.template_id = v_template.id
    ), '[]'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.ingest_tracking_event(p_gps_device_id uuid, p_event_type tracking_event_type, p_event_timestamp timestamp with time zone, p_severity event_severity DEFAULT 'info'::event_severity, p_raw_traccar_event_id text DEFAULT NULL::text, p_geofence_id uuid DEFAULT NULL::uuid, p_latitude double precision DEFAULT NULL::double precision, p_longitude double precision DEFAULT NULL::double precision, p_speed_kph numeric DEFAULT NULL::numeric, p_raw_attributes jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
    where r.vehicle_id = v_device.vehicle_id
    and r.status in ('active', 'overdue')
    and p_event_timestamp >= r.start_at
    and (r.actual_return_at is null or p_event_timestamp <= r.actual_return_at)
  order by r.start_at desc limit 1;

  insert into public.tracking_events (
    vehicle_id, gps_device_id, rental_id, geofence_id,
    event_type, severity, event_timestamp, latitude, longitude, speed_kph,
    raw_traccar_event_id, raw_attributes
  ) values (
    v_device.vehicle_id, v_device.id, v_rental_id,
    p_geofence_id, p_event_type, p_severity, p_event_timestamp, p_latitude,
    p_longitude, p_speed_kph, nullif(trim(p_raw_traccar_event_id), ''),
    coalesce(p_raw_attributes, '{}'::jsonb)
  )
  on conflict (raw_traccar_event_id) do update set
    severity = excluded.severity,
    raw_attributes = excluded.raw_attributes,
    updated_at = now()
  returning id into v_event_id;

  return v_event_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ingest_tracking_position(p_gps_device_id uuid, p_latitude double precision, p_longitude double precision, p_device_time timestamp with time zone, p_source_position_id text DEFAULT NULL::text, p_server_time timestamp with time zone DEFAULT NULL::timestamp with time zone, p_received_at timestamp with time zone DEFAULT now(), p_altitude double precision DEFAULT NULL::double precision, p_speed_kph numeric DEFAULT NULL::numeric, p_heading numeric DEFAULT NULL::numeric, p_accuracy_meters numeric DEFAULT NULL::numeric, p_ignition boolean DEFAULT NULL::boolean, p_motion boolean DEFAULT NULL::boolean, p_external_power boolean DEFAULT NULL::boolean, p_battery_level numeric DEFAULT NULL::numeric, p_alarm_type text DEFAULT NULL::text, p_gps_valid boolean DEFAULT NULL::boolean, p_raw_attributes jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
    where r.vehicle_id = v_device.vehicle_id
    and r.status in ('active', 'overdue')
    and p_device_time >= r.start_at
    and (r.actual_return_at is null or p_device_time <= r.actual_return_at)
  order by r.start_at desc
  limit 1;

  insert into public.vehicle_location_history (
    vehicle_id, gps_device_id, rental_id, source_position_id,
    latitude, longitude, altitude, speed_kph, heading, accuracy_meters,
    ignition, motion, external_power, battery_level, alarm_type, gps_valid,
    device_time, server_time, received_at, raw_attributes
  ) values (
    v_device.vehicle_id, v_device.id, v_rental_id,
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
      where h.gps_device_id = v_device.id
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
    vehicle_id, gps_device_id, latitude, longitude, altitude,
    speed_kph, heading, accuracy_meters, ignition, motion, external_power,
    battery_level, alarm_type, gps_valid, device_time, server_time, received_at,
    raw_attributes
  ) values (
    v_device.vehicle_id, v_device.id, p_latitude,
    p_longitude, p_altitude, p_speed_kph, p_heading, p_accuracy_meters,
    p_ignition, p_motion, p_external_power, p_battery_level, p_alarm_type,
    p_gps_valid, p_device_time, p_server_time, coalesce(p_received_at, now()),
    coalesce(p_raw_attributes, '{}'::jsonb)
  )
  on conflict (vehicle_id) do update set
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
$function$;

CREATE OR REPLACE FUNCTION public.list_my_bookings()
 RETURNS TABLE(id uuid, reference_number text, status rental_status, payment_status rental_payment_status, start_at timestamp with time zone, expected_return_at timestamp with time zone, actual_return_at timestamp with time zone, pickup_location text, return_location text, vehicle_id uuid, vehicle_name text, vehicle_make text, vehicle_model text, vehicle_photo_url text, quoted_total numeric, deposit_amount numeric, balance_due numeric, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_auth_uid uuid := auth.uid();
  v_auth_email text;
begin
  if v_auth_uid is null then
    raise exception 'Sign in to view your bookings.' using errcode = '42501';
  end if;

  select nullif(lower(btrim(u.email)), '')
  into v_auth_email
  from auth.users u
  where u.id = v_auth_uid;

  if v_auth_email is null then
    return;
  end if;
  if not (select private.has_active_profile()) then
    return;
  end if;

  return query
  select
    r.id,
    r.reference_number,
    r.status,
    r.payment_status,
    r.start_at,
    r.expected_return_at,
    r.actual_return_at,
    r.pickup_location,
    r.return_location,
    v.id,
    v.name,
    v.make,
    v.model,
    v.photo_url,
    r.quoted_total,
    r.deposit_amount,
    r.balance_due,
    r.created_at
  from public.rentals r
  inner join public.customers c
    on c.id = r.customer_id
  inner join public.vehicles v
    on v.id = r.vehicle_id
    where lower(btrim(coalesce(c.email, ''))) = v_auth_email
  order by r.start_at desc, r.created_at desc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_rental_payment(p_rental_id uuid, p_payment_type payment_type, p_amount numeric, p_method text DEFAULT 'cash'::text, p_external_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_confirm boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role public.app_role := private.current_app_role();
  v_user_id uuid := auth.uid();
  v_rental_id uuid;
  v_payment_id uuid;
  v_method text := nullif(lower(btrim(coalesce(p_method, ''))), '');
  v_ref text := nullif(btrim(coalesce(p_external_reference, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if v_user_id is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  if v_role not in ('owner', 'admin', 'staff') then
    raise exception 'Staff access is required to record payments.'
      using errcode = '42501';
  end if;
  if p_rental_id is null then
    raise exception 'Select a rental.' using errcode = '22023';
  end if;
  if p_payment_type is null then
    raise exception 'Select a payment type.' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero.' using errcode = '22023';
  end if;
  if v_method is not null
    and v_method not in ('gcash', 'maya', 'bank', 'cash', 'other') then
    raise exception 'Invalid payment method.' using errcode = '22023';
  end if;

  select r.id into v_rental_id
  from public.rentals r
  where r.id = p_rental_id
  for update;

  if not found then
    raise exception 'Rental not found.' using errcode = 'P0002';
  end if;

  insert into public.payments (
    rental_id,
    payment_type,
    amount,
    currency,
    method,
    status,
    external_reference,
    notes,
    submitted_at,
    confirmed_at,
    confirmed_by
  )
  values (
    v_rental_id,
    p_payment_type,
    round(p_amount, 2),
    'PHP',
    v_method,
    case when p_confirm then 'confirmed' else 'submitted' end,
    v_ref,
    coalesce(v_notes, 'Recorded by staff'),
    now(),
    case when p_confirm then now() else null end,
    case when p_confirm then v_user_id else null end
  )
  returning id into v_payment_id;

  perform private.refresh_rental_payment_summary(v_rental_id);

  return jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'rental_id', v_rental_id,
    'message', 'Payment recorded.'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_booking_payment_proof(p_rental_id uuid, p_reference_number text, p_payment_reference text, p_proof_path text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ref text := btrim(coalesce(p_reference_number, ''));
  v_pay_ref text := btrim(coalesce(p_payment_reference, ''));
  v_path text := btrim(coalesce(p_proof_path, ''));
  v_rental record;
  v_payment_id uuid;
begin
  if p_rental_id is null or char_length(v_ref) < 3 then
    raise exception 'Booking reference is required.' using errcode = '22023';
  end if;
  if char_length(v_pay_ref) not between 3 and 120 then
    raise exception 'Enter the GCash/Maya/bank reference number from your payment.'
      using errcode = '22023';
  end if;
  if char_length(v_path) < 8 or position('..' in v_path) > 0 then
    raise exception 'Payment screenshot is required.' using errcode = '22023';
  end if;

  select
    r.id,
        r.status,
    r.payment_status,
    r.reference_number,
    r.deposit_amount,
    c.full_name as customer_name,
    c.phone_number as customer_phone,
    v.name as vehicle_name
  into v_rental
  from public.rentals r
  inner join public.customers c
    on c.id = r.customer_id
  inner join public.vehicles v
    on v.id = r.vehicle_id
  where r.id = p_rental_id
    and r.reference_number = v_ref
  for update of r;

  if not found then
    raise exception 'Booking not found. Check your reference number.'
      using errcode = 'P0002';
  end if;

  if v_rental.status <> 'draft' then
    raise exception 'This booking is already confirmed or closed.'
      using errcode = 'P0001';
  end if;

  if v_rental.payment_status in ('deposit_paid', 'paid_in_full') then
    raise exception 'Deposit for this booking was already confirmed.'
      using errcode = 'P0001';
  end if;

  if v_path not like (v_rental.id::text || '/%') then
    raise exception 'Invalid payment proof path.' using errcode = '22023';
  end if;

  -- Replace any previous unconfirmed deposit submission.
  update public.payments
  set
    status = 'cancelled',
    notes = coalesce(notes || E'\n', '') || 'Superseded by a newer proof upload',
    updated_at = now()
  where rental_id = v_rental.id
    and payment_type = 'deposit'
    and status = 'submitted';

  insert into public.payments (
    rental_id,
    payment_type,
    amount,
    currency,
    method,
    status,
    external_reference,
    proof_path,
    notes,
    submitted_at
  )
  values (
        v_rental.id,
    'deposit',
    greatest(coalesce(v_rental.deposit_amount, 0), 0.01),
    'PHP',
    null,
    'submitted',
    v_pay_ref,
    v_path,
    'Customer uploaded deposit proof',
    now()
  )
  returning id into v_payment_id;

  perform private.refresh_rental_payment_summary(v_rental.id);

  return jsonb_build_object(
    'success', true,
    'rental_id', v_rental.id,
    'payment_id', v_payment_id,
    'reference_number', v_rental.reference_number,
    'payment_status', 'proof_submitted',
    'deposit_amount', v_rental.deposit_amount,
    'customer_name', v_rental.customer_name,
    'customer_phone', v_rental.customer_phone,
    'vehicle_name', v_rental.vehicle_name,
    'payment_reference', v_pay_ref,
    'message', 'Payment proof received. We will confirm your reservation shortly.'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_rental_inspection(p_rental_id uuid, p_inspection_type inspection_type, p_odometer numeric, p_fuel_level numeric, p_cleanliness inspection_cleanliness, p_odor inspection_odor, p_notes text, p_items jsonb, p_photos jsonb DEFAULT '[]'::jsonb, p_customer_signature_path text DEFAULT NULL::text, p_customer_acknowledged boolean DEFAULT false, p_fuel_charge_amount numeric DEFAULT NULL::numeric, p_fuel_charge_note text DEFAULT NULL::text, p_damage_charge_amount numeric DEFAULT NULL::numeric, p_damage_charge_note text DEFAULT NULL::text, p_template_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role public.app_role := private.current_app_role();
  v_user_id uuid := auth.uid();
  v_rental public.rentals%rowtype;
  v_inspection_id uuid;
  v_template_id uuid;
  v_item jsonb;
  v_photo jsonb;
  v_item_id uuid;
  v_next_status public.rental_status;
  v_area_code text;
  v_required_kind text;
  v_payment_id uuid;
  v_damage_note text;
  v_fuel_payment_id uuid;
  v_fuel_note text;
begin
  if not (select private.is_org_staff()) then
    raise exception 'Staff access is required.' using errcode = 'insufficient_privilege';
  end if;

  if p_odometer is null or p_odometer < 0 then
    raise exception 'Odometer reading is required.';
  end if;
  if p_fuel_level is null or p_fuel_level < 0 or p_fuel_level > 100 then
    raise exception 'Fuel level must be between 0 and 100.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'Checklist items are required.';
  end if;
  if p_photos is null or jsonb_typeof(p_photos) <> 'array' then
    raise exception 'Inspection photos are required.';
  end if;

  foreach v_required_kind in array array[
    'overview_front',
    'overview_rear',
    'overview_left',
    'overview_right',
    'overview_interior',
    'overview_dashboard'
  ]
  loop
    if not exists (
      select 1
      from jsonb_array_elements(p_photos) photo
      where photo ->> 'kind' = v_required_kind
        and nullif(trim(coalesce(photo ->> 'storage_path', '')), '') is not null
    ) then
      raise exception
        'Upload front, rear, left, right, interior, and dashboard photos.'
        using errcode = 'check_violation';
    end if;
  end loop;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    if coalesce(v_item ->> 'status', 'ok') <> 'ok'
      and not exists (
        select 1
        from jsonb_array_elements(p_photos) photo
        where photo ->> 'kind' = 'damage_closeup'
          and photo ->> 'area_code' = (v_item ->> 'area_code')
          and nullif(trim(coalesce(photo ->> 'storage_path', '')), '') is not null
      ) then
      raise exception
        'Add a close-up photo for every damaged panel (%).',
        coalesce(v_item ->> 'label', v_item ->> 'area_code')
        using errcode = 'check_violation';
    end if;
  end loop;

  select * into v_rental
  from public.rentals
  where id = p_rental_id
  for update;

  if not found then
    raise exception 'Rental was not found.' using errcode = 'no_data_found';
  end if;

  if p_inspection_type = 'pickup' then
    if v_rental.status not in ('draft', 'reserved') then
      raise exception 'Pickup inspection is only allowed for draft or reserved rentals.';
    end if;
    v_next_status := 'active';
  else
    if v_rental.status not in ('active', 'overdue') then
      raise exception 'Return inspection is only allowed for active or overdue rentals.';
    end if;
    if v_rental.starting_odometer is not null
      and p_odometer < v_rental.starting_odometer then
      raise exception 'Ending odometer cannot be less than the starting odometer.';
    end if;
    v_next_status := 'completed';
  end if;

  if exists (
    select 1 from public.rental_inspections
    where rental_id = p_rental_id
      and inspection_type = p_inspection_type
  ) then
    raise exception 'An inspection of this type already exists for the rental.';
  end if;

  v_template_id := coalesce(
    p_template_id,
    private.ensure_default_inspection_template()
  );

  insert into public.rental_inspections (
    rental_id,
    inspection_type,
    template_id,
    odometer,
    fuel_level,
    cleanliness,
    odor,
    notes,
    fuel_charge_amount,
    fuel_charge_note,
    damage_charge_amount,
    damage_charge_note,
    customer_signature_path,
    customer_acknowledged_at,
    inspected_by,
    inspected_at
  )
  values (
    p_rental_id,
    p_inspection_type,
    v_template_id,
    p_odometer,
    p_fuel_level,
    coalesce(p_cleanliness, 'clean'),
    coalesce(p_odor, 'none'),
    nullif(trim(coalesce(p_notes, '')), ''),
    case when p_inspection_type = 'return' then p_fuel_charge_amount end,
    case when p_inspection_type = 'return'
      then nullif(trim(coalesce(p_fuel_charge_note, '')), '') end,
    case when p_inspection_type = 'return' then p_damage_charge_amount end,
    case when p_inspection_type = 'return'
      then nullif(trim(coalesce(p_damage_charge_note, '')), '') end,
    nullif(trim(coalesce(p_customer_signature_path, '')), ''),
    case when p_customer_acknowledged then now() else null end,
    v_user_id,
    now()
  )
  returning id into v_inspection_id;

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    insert into public.rental_inspection_items (
      inspection_id,
      area_code,
      label,
      item_group,
      body_map_zone,
      status,
      severity,
      notes
    )
    values (
      v_inspection_id,
      v_item ->> 'area_code',
      coalesce(v_item ->> 'label', v_item ->> 'area_code'),
      coalesce(v_item ->> 'item_group', 'exterior'),
      nullif(v_item ->> 'body_map_zone', ''),
      coalesce((v_item ->> 'status')::public.inspection_item_status, 'ok'),
      nullif(v_item ->> 'severity', '')::smallint,
      nullif(trim(coalesce(v_item ->> 'notes', '')), '')
    )
    returning id into v_item_id;

    if (v_item ->> 'status') is not null
      and (v_item ->> 'status') <> 'ok'
      and not exists (
        select 1
        from public.vehicle_known_damages d
        where d.vehicle_id = v_rental.vehicle_id
          and d.area_code = (v_item ->> 'area_code')
          and not d.is_resolved
      ) then
      insert into public.vehicle_known_damages (
        vehicle_id,
        area_code,
        label,
        status,
        severity,
        notes,
        source_inspection_id,
        created_by
      )
      values (
        v_rental.vehicle_id,
        v_item ->> 'area_code',
        coalesce(v_item ->> 'label', v_item ->> 'area_code'),
        (v_item ->> 'status')::public.inspection_item_status,
        nullif(v_item ->> 'severity', '')::smallint,
        nullif(trim(coalesce(v_item ->> 'notes', '')), ''),
        v_inspection_id,
        v_user_id
      );
    end if;
  end loop;

  for v_photo in
    select value from jsonb_array_elements(p_photos)
  loop
    v_item_id := null;
    v_area_code := nullif(v_photo ->> 'area_code', '');
    if v_area_code is not null then
      select id into v_item_id
      from public.rental_inspection_items
      where inspection_id = v_inspection_id
        and area_code = v_area_code
      limit 1;
    end if;

    insert into public.rental_inspection_photos (
      inspection_id,
      item_id,
      storage_path,
      kind,
      caption
    )
    values (
      v_inspection_id,
      v_item_id,
      v_photo ->> 'storage_path',
      coalesce(
        (v_photo ->> 'kind')::public.inspection_photo_kind,
        'other'
      ),
      nullif(trim(coalesce(v_photo ->> 'caption', '')), '')
    );
  end loop;

  if p_inspection_type = 'return'
    and p_fuel_charge_amount is not null
    and p_fuel_charge_amount > 0 then
    v_fuel_note := coalesce(
      nullif(trim(coalesce(p_fuel_charge_note, '')), ''),
      'Fuel shortfall at return inspection'
    );
    insert into public.payments (
      rental_id,
      payment_type,
      amount,
      currency,
      method,
      status,
      notes,
      submitted_at,
      confirmed_at,
      confirmed_by
    )
    values (
      p_rental_id,
      'penalty',
      round(p_fuel_charge_amount, 2),
      'PHP',
      'other',
      'confirmed',
      v_fuel_note || ' (inspection ' || v_inspection_id::text || ')',
      now(),
      now(),
      v_user_id
    )
    returning id into v_fuel_payment_id;

    update public.rental_inspections
    set fuel_payment_id = v_fuel_payment_id
    where id = v_inspection_id;
  end if;

  if p_inspection_type = 'return'
    and p_damage_charge_amount is not null
    and p_damage_charge_amount > 0 then
    v_damage_note := coalesce(
      nullif(trim(coalesce(p_damage_charge_note, '')), ''),
      'Damage penalty from return inspection'
    );
    insert into public.payments (
      rental_id,
      payment_type,
      amount,
      currency,
      method,
      status,
      notes,
      submitted_at,
      confirmed_at,
      confirmed_by
    )
    values (
      p_rental_id,
      'penalty',
      round(p_damage_charge_amount, 2),
      'PHP',
      'other',
      'confirmed',
      v_damage_note || ' (inspection ' || v_inspection_id::text || ')',
      now(),
      now(),
      v_user_id
    )
    returning id into v_payment_id;

    update public.rental_inspections
    set damage_payment_id = v_payment_id
    where id = v_inspection_id;
  end if;

  -- One refresh covers whichever of the two penalty rows were written.
  if v_fuel_payment_id is not null or v_payment_id is not null then
    perform private.refresh_rental_payment_summary(p_rental_id);
  end if;

  if p_inspection_type = 'pickup' and v_rental.tracking_consent_at is null then
    update public.rentals
    set tracking_consent_at = now()
    where id = p_rental_id
      and tracking_consent_at is null;
  end if;

  update public.rentals
  set
    status = v_next_status,
    starting_odometer = case
      when p_inspection_type = 'pickup' then p_odometer
      else starting_odometer
    end,
    starting_fuel_level = case
      when p_inspection_type = 'pickup' then p_fuel_level
      else starting_fuel_level
    end,
    ending_odometer = case
      when p_inspection_type = 'return' then p_odometer
      else ending_odometer
    end,
    ending_fuel_level = case
      when p_inspection_type = 'return' then p_fuel_level
      else ending_fuel_level
    end,
    actual_return_at = case
      when p_inspection_type = 'return' then coalesce(actual_return_at, now())
      else actual_return_at
    end,
    notes = case
      when p_notes is not null and length(trim(p_notes)) > 0 then
        case
          when notes is null or length(trim(notes)) = 0 then trim(p_notes)
          else notes || E'\n' || trim(p_notes)
        end
      else notes
    end
  where id = p_rental_id;

  if p_inspection_type = 'return' then
    update public.vehicles
    set current_odometer = p_odometer,
        updated_at = now()
    where id = v_rental.vehicle_id;
  end if;

  perform private.write_audit_log(
    'rental.inspection_submitted',
    'rental',
    p_rental_id,
    null,
    jsonb_build_object(
      'inspection_id', v_inspection_id,
      'inspection_type', p_inspection_type,
      'status', v_next_status,
      'odometer', p_odometer,
      'fuel_level', p_fuel_level,
      'damage_payment_id', v_payment_id,
      'damage_charge_amount', p_damage_charge_amount,
      'fuel_payment_id', v_fuel_payment_id,
      'fuel_charge_amount', p_fuel_charge_amount
    ),
    '{}'::jsonb
  );

  return v_inspection_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sweep_overdue_rentals()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role public.app_role := private.current_app_role();
begin
  if not (select private.is_org_staff()) then
    raise exception 'Staff access is required.' using errcode = 'insufficient_privilege';
  end if;

  return private.mark_overdue_rentals();
end;
$function$;


-- ---------------------------------------------------------------------------
-- 4. Tenant-safe composite foreign keys become plain ones. ON DELETE
--    behaviour is preserved exactly; without this the CASCADE in step 8
--    would drop them and leave no referential integrity at all.
-- ---------------------------------------------------------------------------
alter table public.gps_devices drop constraint if exists gps_devices_vehicle_tenant_fkey;
alter table public.gps_devices add constraint gps_devices_vehicle_fkey foreign key (vehicle_id) references public.vehicles(id) on delete restrict;
alter table public.notification_preferences drop constraint if exists notification_preferences_profile_tenant_fkey;
alter table public.notification_preferences add constraint notification_preferences_profile_fkey foreign key (profile_id) references public.profiles(id) on delete cascade;
alter table public.payments drop constraint if exists payments_rental_tenant_fkey;
alter table public.payments add constraint payments_rental_fkey foreign key (rental_id) references public.rentals(id) on delete cascade;
alter table public.rental_geofences drop constraint if exists rental_geofences_geofence_tenant_fkey;
alter table public.rental_geofences add constraint rental_geofences_geofence_fkey foreign key (geofence_id) references public.geofences(id) on delete cascade;
alter table public.rental_geofences drop constraint if exists rental_geofences_rental_tenant_fkey;
alter table public.rental_geofences add constraint rental_geofences_rental_fkey foreign key (rental_id) references public.rentals(id) on delete cascade;
alter table public.rental_inspections drop constraint if exists rental_inspections_damage_payment_fkey;
alter table public.rental_inspections add constraint rental_inspections_damage_payment_fkey foreign key (damage_payment_id) references public.payments(id) on delete set null;
alter table public.rental_inspections drop constraint if exists rental_inspections_fuel_payment_fkey;
alter table public.rental_inspections add constraint rental_inspections_fuel_payment_fkey foreign key (fuel_payment_id) references public.payments(id) on delete set null;
alter table public.rentals drop constraint if exists rentals_customer_tenant_fkey;
alter table public.rentals add constraint rentals_customer_fkey foreign key (customer_id) references public.customers(id) on delete restrict;
alter table public.rentals drop constraint if exists rentals_vehicle_tenant_fkey;
alter table public.rentals add constraint rentals_vehicle_fkey foreign key (vehicle_id) references public.vehicles(id) on delete restrict;
alter table public.tracking_events drop constraint if exists tracking_events_device_tenant_fkey;
alter table public.tracking_events add constraint tracking_events_device_fkey foreign key (gps_device_id) references public.gps_devices(id) on delete restrict;
alter table public.tracking_events drop constraint if exists tracking_events_geofence_tenant_fkey;
alter table public.tracking_events add constraint tracking_events_geofence_fkey foreign key (geofence_id) references public.geofences(id) on delete set null;
alter table public.tracking_events drop constraint if exists tracking_events_rental_tenant_fkey;
alter table public.tracking_events add constraint tracking_events_rental_fkey foreign key (rental_id) references public.rentals(id) on delete set null;
alter table public.tracking_events drop constraint if exists tracking_events_vehicle_tenant_fkey;
alter table public.tracking_events add constraint tracking_events_vehicle_fkey foreign key (vehicle_id) references public.vehicles(id) on delete cascade;
alter table public.vehicle_geofences drop constraint if exists vehicle_geofences_geofence_tenant_fkey;
alter table public.vehicle_geofences add constraint vehicle_geofences_geofence_fkey foreign key (geofence_id) references public.geofences(id) on delete cascade;
alter table public.vehicle_geofences drop constraint if exists vehicle_geofences_vehicle_tenant_fkey;
alter table public.vehicle_geofences add constraint vehicle_geofences_vehicle_fkey foreign key (vehicle_id) references public.vehicles(id) on delete cascade;
alter table public.vehicle_latest_locations drop constraint if exists vehicle_latest_locations_device_tenant_fkey;
alter table public.vehicle_latest_locations add constraint vehicle_latest_locations_device_fkey foreign key (gps_device_id) references public.gps_devices(id) on delete restrict;
alter table public.vehicle_latest_locations drop constraint if exists vehicle_latest_locations_vehicle_tenant_fkey;
alter table public.vehicle_latest_locations add constraint vehicle_latest_locations_vehicle_fkey foreign key (vehicle_id) references public.vehicles(id) on delete cascade;
alter table public.vehicle_location_history drop constraint if exists vehicle_location_history_device_tenant_fkey;
alter table public.vehicle_location_history add constraint vehicle_location_history_device_fkey foreign key (gps_device_id) references public.gps_devices(id) on delete restrict;
alter table public.vehicle_location_history drop constraint if exists vehicle_location_history_rental_tenant_fkey;
alter table public.vehicle_location_history add constraint vehicle_location_history_rental_fkey foreign key (rental_id) references public.rentals(id) on delete set null;
alter table public.vehicle_location_history drop constraint if exists vehicle_location_history_vehicle_tenant_fkey;
alter table public.vehicle_location_history add constraint vehicle_location_history_vehicle_fkey foreign key (vehicle_id) references public.vehicles(id) on delete cascade;
alter table public.vehicle_photos drop constraint if exists vehicle_photos_tenant_fkey;
alter table public.vehicle_photos add constraint vehicle_photos_fkey foreign key (vehicle_id) references public.vehicles(id) on delete cascade;
-- ---------------------------------------------------------------------------
-- 6. Uniqueness rules, re-expressed without the tenant column.
--
--    These are NOT redundant plumbing: `drop column ... cascade` would delete
--    every one of them and leave the database happily accepting duplicate
--    plate numbers, duplicate licence numbers, duplicate rental reference
--    numbers and several "default" inspection templates. Each is recreated
--    first, so there is never a window without it.
-- ---------------------------------------------------------------------------

-- one settings row per key
alter table public.app_settings
  add constraint app_settings_setting_key_key unique (setting_key);

-- one rental reference number
alter table public.rentals
  add constraint rentals_reference_number_key unique (reference_number);

-- one notification preference per profile + event
alter table public.notification_preferences
  add constraint notification_preferences_profile_event_key
  unique nulls not distinct (profile_id, event_type);

-- idempotent tracking-event ingest
alter table public.tracking_events
  add constraint tracking_events_raw_traccar_event_id_key
  unique (raw_traccar_event_id);

-- one active vehicle per plate
create unique index vehicles_active_plate_uidx
  on public.vehicles (lower(trim(plate_number)))
  where status <> 'inactive';

-- one active tracker per hardware identifier
create unique index gps_devices_active_identifier_uidx
  on public.gps_devices (lower(trim(unique_identifier)))
  where is_active;

-- one customer per driver's licence
create unique index customers_license_uidx
  on public.customers (lower(trim(drivers_license_number)));

-- one driver per driver's licence
create unique index drivers_license_unique
  on public.drivers (lower(trim(drivers_license_number)));

-- idempotent position ingest
create unique index vehicle_location_history_source_position_uidx2
  on public.vehicle_location_history (gps_device_id, source_position_id)
  where source_position_id is not null;

create unique index vehicle_location_history_fallback_uidx2
  on public.vehicle_location_history (gps_device_id, device_time, latitude, longitude);

-- exactly one default inspection template company-wide
create unique index inspection_checklist_templates_one_default
  on public.inspection_checklist_templates ((true))
  where is_default and is_active;

-- one active template per vehicle category
create unique index inspection_checklist_templates_category_uidx
  on public.inspection_checklist_templates (lower(vehicle_category))
  where vehicle_category is not null and is_active;

-- ---------------------------------------------------------------------------
-- 7. Storage: stop reading the tenant segment.
--
--    Existing objects keep their `<old-org-uuid>/<rental-id>/...` names; the
--    policies no longer look at segment 1, so nothing has to be copied. New
--    uploads write `<rental-id>/...`.
-- ---------------------------------------------------------------------------
drop policy if exists payment_proofs_select_admin on storage.objects;
create policy payment_proofs_select_admin
on storage.objects for select to authenticated
using (
  bucket_id = 'payment-proofs'
  and (select private.is_org_staff())
);

drop policy if exists payment_proofs_delete_admin on storage.objects;
create policy payment_proofs_delete_admin
on storage.objects for delete to authenticated
using (
  bucket_id = 'payment-proofs'
  and (select private.is_org_admin())
);

drop policy if exists rental_inspection_photos_select_staff on storage.objects;
create policy rental_inspection_photos_select_staff
on storage.objects for select to authenticated
using (
  bucket_id = 'rental-inspection-photos'
  and (
    (select private.is_org_staff())
    or private.customer_can_read_inspection_object(name)
  )
);

drop policy if exists rental_inspection_photos_insert_staff on storage.objects;
create policy rental_inspection_photos_insert_staff
on storage.objects for insert to authenticated
with check (
  bucket_id = 'rental-inspection-photos'
  and (select private.is_org_staff())
);

drop policy if exists rental_inspection_photos_delete_admin on storage.objects;
create policy rental_inspection_photos_delete_admin
on storage.objects for delete to authenticated
using (
  bucket_id = 'rental-inspection-photos'
  and (select private.is_org_admin())
);

-- ---------------------------------------------------------------------------
-- 8. The tenant resolvers have no callers left.
-- ---------------------------------------------------------------------------
drop function if exists private.resolve_public_listing_organization_id();
drop function if exists private.current_organization_id();

-- ---------------------------------------------------------------------------
-- 9. Drop the column. CASCADE clears the remaining tenant FKs, the
--    (organization_id, id) composite uniques and the org-prefixed indexes --
--    all of which have been replaced above.
-- ---------------------------------------------------------------------------
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'profiles', 'vehicles', 'customers', 'rentals', 'gps_devices', 'geofences',
    'vehicle_geofences', 'rental_geofences', 'tracking_events',
    'vehicle_latest_locations', 'vehicle_location_history',
    'integration_sync_logs', 'notification_preferences', 'app_settings',
    'audit_logs', 'payments', 'rental_inspections',
    'inspection_checklist_templates', 'vehicle_known_damages',
    'vehicle_photos', 'drivers'
  ] loop
    execute format('alter table public.%I drop column organization_id cascade', v_table);
  end loop;
end
$$;
