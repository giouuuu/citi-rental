-- Security fix: organization-scoped reads are for staff (owner/admin/staff) only.
--
-- Google-signed-in customers get a `profiles` row with role `customer` inside
-- the business's own organization (20260725134821_google_customer_profile_trigger).
-- Many SELECT policies only checked `organization_id = current_organization_id()`,
-- so a customer could read every customer's PII, every rental, the fleet,
-- drivers, other profiles, GPS data, etc. straight through PostgREST.
--
-- Customer-facing features never read these tables directly: they read their
-- own `profiles` row and otherwise go through SECURITY DEFINER RPCs
-- (list_my_bookings, get_my_booking_condition_report, get_public_vehicle,
-- list_public_available_vehicles, list_public_vehicle_booked_ranges,
-- create_public_booking, get_booking_payment_details,
-- submit_booking_payment_proof), which are unaffected by RLS.
--
-- Policy inventory (pg_policies, cmd in SELECT/ALL, after all prior migrations):
--   changed here   -> every org-scoped SELECT policy without a role check,
--                     profiles, app_settings, and the inspection-photo storage
--                     policy whose customer branch queried rentals/customers
--                     through RLS.
--   left as is     -> organizations_select_own (own org name/payment QR is not
--                     sensitive), notification_preferences_select (own row or
--                     owner/admin), vehicle_photos_select_public (public site),
--                     payments/audit_logs/rental_inspections*/
--                     vehicle_known_damages select policies (already role
--                     checked), and the FOR ALL write policies (role checked).

-- ---------------------------------------------------------------------------
-- Helper
-- ---------------------------------------------------------------------------

create or replace function private.is_org_staff()
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
      and p.role in ('owner', 'admin', 'staff')
  )
$$;

revoke all on function private.is_org_staff() from public, anon;
grant execute on function private.is_org_staff() to authenticated, service_role;

comment on function private.is_org_staff() is
  'True when the caller has an active owner/admin/staff profile. Use in RLS for org-internal reads.';

-- ---------------------------------------------------------------------------
-- Ordinary org-scoped business records: staff only
-- ---------------------------------------------------------------------------

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'vehicles', 'gps_devices', 'customers', 'rentals', 'geofences',
    'rental_geofences', 'vehicle_geofences', 'vehicle_latest_locations',
    'vehicle_location_history', 'tracking_events', 'integration_sync_logs',
    'drivers'
  ] loop
    execute format(
      'drop policy if exists %I on public.%I',
      v_table || '_select_organization', v_table
    );
    execute format(
      'create policy %I on public.%I for select to authenticated '
      || 'using (organization_id = (select private.current_organization_id()) '
      || 'and (select private.is_org_staff()))',
      v_table || '_select_organization', v_table
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Inspection checklist templates
-- ---------------------------------------------------------------------------

drop policy if exists inspection_templates_select_org
  on public.inspection_checklist_templates;
create policy inspection_templates_select_org
on public.inspection_checklist_templates for select to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.is_org_staff())
);

drop policy if exists inspection_template_items_select_org
  on public.inspection_checklist_template_items;
create policy inspection_template_items_select_org
on public.inspection_checklist_template_items for select to authenticated
using (
  (select private.is_org_staff())
  and exists (
    select 1 from public.inspection_checklist_templates t
    where t.id = template_id
      and t.organization_id = (select private.current_organization_id())
  )
);

-- ---------------------------------------------------------------------------
-- Profiles: own row for everyone; the org roster for staff only
-- ---------------------------------------------------------------------------

drop policy if exists profiles_select_organization on public.profiles;
drop policy if exists profiles_select_self_or_staff on public.profiles;
create policy profiles_select_self_or_staff
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or (
    organization_id = (select private.current_organization_id())
    and (select private.is_org_staff())
  )
);

-- ---------------------------------------------------------------------------
-- App settings: non-sensitive for staff, everything for owner/admin
-- ---------------------------------------------------------------------------

drop policy if exists app_settings_select_safe on public.app_settings;
create policy app_settings_select_safe
on public.app_settings for select to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (
    (select private.current_app_role()) in ('owner', 'admin')
    or (not is_sensitive and (select private.is_org_staff()))
  )
);

-- ---------------------------------------------------------------------------
-- Inspection photo storage: the renter branch used to join rentals/customers
-- under the caller's RLS. With those tables now staff-only it would silently
-- stop matching, so the ownership check moves into a SECURITY DEFINER helper
-- (same rule as before: object path {org_id}/{rental_id}/... belongs to a
-- rental whose customer email equals the caller's verified JWT email).
-- ---------------------------------------------------------------------------

create or replace function private.customer_can_read_inspection_object(
  p_object_name text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rentals r
    join public.customers c
      on c.id = r.customer_id
     and c.organization_id = r.organization_id
    where r.organization_id::text = (storage.foldername(p_object_name))[1]
      and r.id::text = (storage.foldername(p_object_name))[2]
      and nullif(btrim(coalesce(c.email, '')), '') is not null
      and nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), '') is not null
      and lower(btrim(c.email)) = lower(btrim(auth.jwt() ->> 'email'))
  )
$$;

revoke all on function private.customer_can_read_inspection_object(text)
  from public, anon;
grant execute on function private.customer_can_read_inspection_object(text)
  to authenticated, service_role;

drop policy if exists "rental_inspection_photos_select_staff" on storage.objects;
create policy "rental_inspection_photos_select_staff"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'rental-inspection-photos'
  and (
    (
      (storage.foldername(name))[1] = (select private.current_organization_id()::text)
      and (select private.is_org_staff())
    )
    or private.customer_can_read_inspection_object(name)
  )
);
