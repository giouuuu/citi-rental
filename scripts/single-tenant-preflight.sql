-- ===========================================================================
-- READ-ONLY pre-flight for 20261004120000_single_tenant_drop_organizations.sql
--
-- NOT a migration. Nothing here writes. Paste it into the Supabase SQL editor
-- for the REAL project and read the verdict column before applying the
-- migration. It answers one question: will that migration apply cleanly to
-- this database's actual data?
--
-- Context: the migration runs inside a transaction, so if its own guard trips
-- the whole thing rolls back and nothing is changed. This script just lets you
-- find that out before spending the attempt.
-- ===========================================================================

-- 1. The migration's own guard: it refuses to run with more than one
--    organization, because collapsing would merge two companies' books.
select
  '01. organization count' as check,
  count(*)::text as value,
  case
    when count(*) = 1 then 'OK'
    when count(*) = 0 then 'OK (migration seeds a company_profile row)'
    else 'BLOCKED -- migration will abort. Remove the extra organization(s) first.'
  end as verdict
from public.organizations

union all

-- 2. Which organizations actually hold data. A stray second row with zero
--    rows attached is easy to delete; one with rentals is a real decision.
select
  '02. rows per organization',
  string_agg(
    o.name || ': ' || (
      (select count(*) from public.vehicles v where v.organization_id = o.id) +
      (select count(*) from public.rentals r where r.organization_id = o.id) +
      (select count(*) from public.customers c where c.organization_id = o.id)
    )::text,
    ' | ' order by o.name
  ),
  'review -- vehicles + rentals + customers per organization'
from public.organizations o

union all

-- 03..09. The migration recreates these uniqueness rules without the tenant
--    column. Within a single organization they are equivalent, so these should
--    all read OK. A duplicate here means a second organization's data is
--    still present.
select '03. duplicate active plates', coalesce(string_agg(p, ', '), 'none'),
       case when count(*) = 0 then 'OK' else 'BLOCKED -- vehicles_active_plate_uidx would fail' end
from (
  select lower(trim(plate_number)) as p
  from public.vehicles where status <> 'inactive'
  group by 1 having count(*) > 1
) d

union all

select '04. duplicate customer licences', coalesce(string_agg(l, ', '), 'none'),
       case when count(*) = 0 then 'OK' else 'BLOCKED -- customers_license_uidx would fail' end
from (
  select lower(trim(drivers_license_number)) as l
  from public.customers group by 1 having count(*) > 1
) d

union all

select '05. duplicate driver licences', coalesce(string_agg(l, ', '), 'none'),
       case when count(*) = 0 then 'OK' else 'BLOCKED -- drivers_license_unique would fail' end
from (
  select lower(trim(drivers_license_number)) as l
  from public.drivers group by 1 having count(*) > 1
) d

union all

select '06. duplicate rental references', coalesce(string_agg(r, ', '), 'none'),
       case when count(*) = 0 then 'OK' else 'BLOCKED -- rentals_reference_number_key would fail' end
from (
  select reference_number as r
  from public.rentals where reference_number is not null
  group by 1 having count(*) > 1
) d

union all

select '07. duplicate setting keys', coalesce(string_agg(k, ', '), 'none'),
       case when count(*) = 0 then 'OK' else 'BLOCKED -- app_settings_setting_key_key would fail' end
from (
  select setting_key as k from public.app_settings group by 1 having count(*) > 1
) d

union all

select '08. default inspection templates', count(*)::text,
       case when count(*) <= 1 then 'OK'
            else 'BLOCKED -- inspection_checklist_templates_one_default would fail' end
from public.inspection_checklist_templates
where is_default and is_active

union all

select '09. duplicate traccar event ids', coalesce(string_agg(e, ', '), 'none'),
       case when count(*) = 0 then 'OK' else 'BLOCKED -- tracking_events_raw_traccar_event_id_key would fail' end
from (
  select raw_traccar_event_id as e
  from public.tracking_events where raw_traccar_event_id is not null
  group by 1 having count(*) > 1
) d

union all

-- 10. The migration renames organizations -> company_profile. Anything created
--     OUTSIDE the migration files (a view added in the dashboard, say) that
--     references the old name would break. The migration set itself has none.
select '10. views referencing organizations', coalesce(string_agg(table_name, ', '), 'none'),
       case when count(*) = 0 then 'OK'
            else 'review -- these reference organizations and are not in the migrations' end
from information_schema.views
where table_schema not in ('pg_catalog', 'information_schema')
  and view_definition ilike '%organizations%'

union all

-- 11. Informational only. Storage objects are NOT migrated: the policies stop
--     reading the tenant path segment, so existing names keep working.
select '11. storage objects (kept as-is)', count(*)::text, 'informational -- no object is moved'
from storage.objects
where bucket_id in ('rental-inspection-photos', 'payment-proofs')

order by 1;


-- ===========================================================================
-- IF CHECK 01 READS "BLOCKED": removing an extra organization
--
-- This is NOT a one-liner. Most tables reference organizations with
-- ON DELETE RESTRICT, so `delete from organizations` fails on profiles before
-- it touches anything else. The order below is the one that works -- children
-- first, then the organization row, which cascades the remainder
-- (app_settings, audit_logs, drivers, inspection templates, inspections,
-- vehicle photos, known damages, integration logs).
--
-- DESTRUCTIVE AND IRREVERSIBLE. Take a backup first. Run it only after
-- check 02 has convinced you the organization you are naming holds nothing you
-- want. Replace 'other-org' with the real slug. It is wrapped in a transaction,
-- so review the row counts and only then commit.
--
-- Deliberately left commented out.
-- ===========================================================================

-- begin;
-- delete from public.payments                 where organization_id = (select id from public.organizations where slug = 'REPLACE-ME');
-- delete from public.tracking_events          where organization_id = (select id from public.organizations where slug = 'REPLACE-ME');
-- delete from public.vehicle_location_history where organization_id = (select id from public.organizations where slug = 'REPLACE-ME');
-- delete from public.vehicle_latest_locations where organization_id = (select id from public.organizations where slug = 'REPLACE-ME');
-- delete from public.rental_geofences         where organization_id = (select id from public.organizations where slug = 'REPLACE-ME');
-- delete from public.vehicle_geofences        where organization_id = (select id from public.organizations where slug = 'REPLACE-ME');
-- delete from public.rentals                  where organization_id = (select id from public.organizations where slug = 'REPLACE-ME');
-- delete from public.customers                where organization_id = (select id from public.organizations where slug = 'REPLACE-ME');
-- delete from public.vehicles                 where organization_id = (select id from public.organizations where slug = 'REPLACE-ME');
-- delete from public.gps_devices              where organization_id = (select id from public.organizations where slug = 'REPLACE-ME');
-- delete from public.geofences                where organization_id = (select id from public.organizations where slug = 'REPLACE-ME');
-- delete from public.notification_preferences where organization_id = (select id from public.organizations where slug = 'REPLACE-ME');
-- delete from public.profiles                 where organization_id = (select id from public.organizations where slug = 'REPLACE-ME');
-- delete from public.organizations            where slug = 'REPLACE-ME';
-- commit;

-- Note: deleting a profile does not delete its auth.users identity. Remove
-- those separately from Authentication -> Users if the people should lose
-- access entirely.
