-- Public bucket for vehicle photos. Paths: {organization_id}/{vehicle_id}/{filename}

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vehicle-photos',
  'vehicle-photos',
  true,
  5242880,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "vehicle_photos_public_select" on storage.objects;
drop policy if exists "vehicle_photos_admin_insert" on storage.objects;
drop policy if exists "vehicle_photos_admin_update" on storage.objects;
drop policy if exists "vehicle_photos_admin_delete" on storage.objects;

create policy "vehicle_photos_public_select"
on storage.objects
for select
to public
using (bucket_id = 'vehicle-photos');

create policy "vehicle_photos_admin_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'vehicle-photos'
  and (storage.foldername(name))[1] = (select private.current_organization_id()::text)
  and (select private.current_app_role()) = 'administrator'
);

create policy "vehicle_photos_admin_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'vehicle-photos'
  and (storage.foldername(name))[1] = (select private.current_organization_id()::text)
  and (select private.current_app_role()) = 'administrator'
)
with check (
  bucket_id = 'vehicle-photos'
  and (storage.foldername(name))[1] = (select private.current_organization_id()::text)
  and (select private.current_app_role()) = 'administrator'
);

create policy "vehicle_photos_admin_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'vehicle-photos'
  and (storage.foldername(name))[1] = (select private.current_organization_id()::text)
  and (select private.current_app_role()) = 'administrator'
);

-- Seed fleet for Giou Keannu Rentals (idempotent by plate number).
do $$
declare
  v_org_id uuid := '75318e52-9c72-4711-9965-d7f1085631e8';
begin
  if not exists (select 1 from public.organizations where id = v_org_id) then
    raise notice 'Organization % not found; skipping vehicle seed.', v_org_id;
    return;
  end if;

  insert into public.vehicles (
    id, organization_id, plate_number, name, make, model, year, color, category,
    transmission, fuel_type, seating_capacity, current_odometer, status, notes
  )
  select *
  from (
    values
      (
        'a1000001-0000-4000-8000-000000000001'::uuid,
        v_org_id,
        'NCR 1001',
        'Toyota Vios 01',
        'Toyota',
        'Vios',
        2023,
        'White',
        'Sedan',
        'automatic'::public.vehicle_transmission,
        'gasoline'::public.vehicle_fuel_type,
        5,
        12450.0,
        'available'::public.vehicle_status,
        'Seed sedan for city rentals.'
      ),
      (
        'a1000001-0000-4000-8000-000000000002'::uuid,
        v_org_id,
        'NCR 1002',
        'Honda City 01',
        'Honda',
        'City',
        2022,
        'Silver',
        'Sedan',
        'cvt'::public.vehicle_transmission,
        'gasoline'::public.vehicle_fuel_type,
        5,
        20110.0,
        'available'::public.vehicle_status,
        'Seed sedan with CVT.'
      ),
      (
        'a1000001-0000-4000-8000-000000000003'::uuid,
        v_org_id,
        'NCR 2001',
        'Toyota Innova 01',
        'Toyota',
        'Innova',
        2024,
        'Pearl White',
        'MPV',
        'automatic'::public.vehicle_transmission,
        'diesel'::public.vehicle_fuel_type,
        7,
        8320.0,
        'available'::public.vehicle_status,
        'Seed family MPV.'
      ),
      (
        'a1000001-0000-4000-8000-000000000004'::uuid,
        v_org_id,
        'NCR 3001',
        'Mitsubishi Xpander 01',
        'Mitsubishi',
        'Xpander',
        2023,
        'Black',
        'MPV',
        'automatic'::public.vehicle_transmission,
        'gasoline'::public.vehicle_fuel_type,
        7,
        15680.0,
        'available'::public.vehicle_status,
        'Seed crossover MPV.'
      ),
      (
        'a1000001-0000-4000-8000-000000000005'::uuid,
        v_org_id,
        'NCR 4001',
        'Ford Ranger 01',
        'Ford',
        'Ranger',
        2022,
        'Blue',
        'Pickup',
        'automatic'::public.vehicle_transmission,
        'diesel'::public.vehicle_fuel_type,
        5,
        28940.0,
        'available'::public.vehicle_status,
        'Seed pickup for cargo trips.'
      ),
      (
        'a1000001-0000-4000-8000-000000000006'::uuid,
        v_org_id,
        'NCR 5001',
        'Hyundai Staria 01',
        'Hyundai',
        'Staria',
        2024,
        'Gray',
        'Van',
        'automatic'::public.vehicle_transmission,
        'diesel'::public.vehicle_fuel_type,
        11,
        4120.0,
        'maintenance'::public.vehicle_status,
        'Seed van currently in maintenance.'
      )
  ) as seed (
    id, organization_id, plate_number, name, make, model, year, color, category,
    transmission, fuel_type, seating_capacity, current_odometer, status, notes
  )
  where not exists (
    select 1
    from public.vehicles existing
    where existing.organization_id = v_org_id
      and lower(trim(existing.plate_number)) = lower(trim(seed.plate_number))
  );
end;
$$;
