-- Pickup / return vehicle condition inspections (checklist, body map, photos, signatures).

create type public.inspection_type as enum ('pickup', 'return');

create type public.inspection_item_status as enum (
  'ok',
  'scratch',
  'dent',
  'chip',
  'crack',
  'missing',
  'dirty',
  'damaged',
  'other'
);

create type public.inspection_photo_kind as enum (
  'overview_front',
  'overview_rear',
  'overview_left',
  'overview_right',
  'overview_interior',
  'overview_dashboard',
  'odometer',
  'fuel_gauge',
  'damage_closeup',
  'signature',
  'other'
);

create type public.inspection_cleanliness as enum (
  'clean',
  'acceptable',
  'dirty',
  'needs_detailing'
);

create type public.inspection_odor as enum (
  'none',
  'smoke',
  'strong',
  'other'
);

-- ---------------------------------------------------------------------------
-- Checklist templates (org-scoped; optional vehicle_category specialization)
-- ---------------------------------------------------------------------------

create table public.inspection_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  vehicle_category text
    check (vehicle_category is null or char_length(trim(vehicle_category)) between 1 and 80),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index inspection_checklist_templates_one_default_per_org
  on public.inspection_checklist_templates (organization_id)
  where is_default and is_active;

create unique index inspection_checklist_templates_category_unique
  on public.inspection_checklist_templates (organization_id, lower(vehicle_category))
  where vehicle_category is not null and is_active;

create table public.inspection_checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null
    references public.inspection_checklist_templates (id) on delete cascade,
  area_code text not null check (char_length(trim(area_code)) between 1 and 64),
  label text not null check (char_length(trim(label)) between 1 and 120),
  item_group text not null check (char_length(trim(item_group)) between 1 and 64),
  body_map_zone text check (body_map_zone is null or char_length(trim(body_map_zone)) <= 64),
  sort_order integer not null default 0,
  is_required boolean not null default true,
  created_at timestamptz not null default now(),
  unique (template_id, area_code)
);

create index inspection_checklist_template_items_template_idx
  on public.inspection_checklist_template_items (template_id, sort_order);

-- ---------------------------------------------------------------------------
-- Rental inspections
-- ---------------------------------------------------------------------------

create table public.rental_inspections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  rental_id uuid not null references public.rentals (id) on delete cascade,
  inspection_type public.inspection_type not null,
  template_id uuid references public.inspection_checklist_templates (id) on delete set null,
  odometer numeric(12, 1) not null check (odometer >= 0),
  fuel_level numeric(5, 2) not null check (fuel_level between 0 and 100),
  cleanliness public.inspection_cleanliness not null default 'clean',
  odor public.inspection_odor not null default 'none',
  notes text check (notes is null or char_length(notes) <= 4000),
  fuel_charge_amount numeric(12, 2)
    check (fuel_charge_amount is null or fuel_charge_amount >= 0),
  fuel_charge_note text check (fuel_charge_note is null or char_length(fuel_charge_note) <= 1000),
  damage_charge_amount numeric(12, 2)
    check (damage_charge_amount is null or damage_charge_amount >= 0),
  damage_charge_note text
    check (damage_charge_note is null or char_length(damage_charge_note) <= 1000),
  customer_signature_path text,
  customer_acknowledged_at timestamptz,
  inspected_by uuid references public.profiles (id) on delete set null,
  inspected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rental_id, inspection_type)
);

create index rental_inspections_org_rental_idx
  on public.rental_inspections (organization_id, rental_id);

create table public.rental_inspection_items (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null
    references public.rental_inspections (id) on delete cascade,
  area_code text not null check (char_length(trim(area_code)) between 1 and 64),
  label text not null check (char_length(trim(label)) between 1 and 120),
  item_group text not null check (char_length(trim(item_group)) between 1 and 64),
  body_map_zone text,
  status public.inspection_item_status not null default 'ok',
  severity smallint check (severity is null or severity between 1 and 5),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  unique (inspection_id, area_code)
);

create index rental_inspection_items_inspection_idx
  on public.rental_inspection_items (inspection_id);

create table public.rental_inspection_photos (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null
    references public.rental_inspections (id) on delete cascade,
  item_id uuid references public.rental_inspection_items (id) on delete set null,
  storage_path text not null check (char_length(trim(storage_path)) between 1 and 500),
  kind public.inspection_photo_kind not null default 'other',
  caption text check (caption is null or char_length(caption) <= 200),
  created_at timestamptz not null default now()
);

create index rental_inspection_photos_inspection_idx
  on public.rental_inspection_photos (inspection_id);

-- ---------------------------------------------------------------------------
-- Known / recurring damage on vehicles
-- ---------------------------------------------------------------------------

create table public.vehicle_known_damages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  area_code text not null check (char_length(trim(area_code)) between 1 and 64),
  label text not null check (char_length(trim(label)) between 1 and 120),
  status public.inspection_item_status not null,
  severity smallint check (severity is null or severity between 1 and 5),
  notes text check (notes is null or char_length(notes) <= 1000),
  photo_path text,
  source_inspection_id uuid
    references public.rental_inspections (id) on delete set null,
  is_resolved boolean not null default false,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vehicle_known_damages_vehicle_open_idx
  on public.vehicle_known_damages (organization_id, vehicle_id)
  where not is_resolved;

-- ---------------------------------------------------------------------------
-- Storage bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rental-inspection-photos',
  'rental-inspection-photos',
  false,
  5242880,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "rental_inspection_photos_insert_staff" on storage.objects;
drop policy if exists "rental_inspection_photos_select_staff" on storage.objects;
drop policy if exists "rental_inspection_photos_delete_admin" on storage.objects;

create policy "rental_inspection_photos_insert_staff"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'rental-inspection-photos'
  and (storage.foldername(name))[1] = (select private.current_organization_id()::text)
  and (select private.current_app_role()) in ('owner', 'admin', 'staff')
);

create policy "rental_inspection_photos_select_staff"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'rental-inspection-photos'
  and (
    (
      (storage.foldername(name))[1] = (select private.current_organization_id()::text)
      and (select private.current_app_role()) in ('owner', 'admin', 'staff')
    )
    or exists (
      select 1
      from public.rentals r
      join public.customers c on c.id = r.customer_id
      where r.organization_id::text = (storage.foldername(name))[1]
        and r.id::text = (storage.foldername(name))[2]
        and c.email is not null
        and lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  )
);

create policy "rental_inspection_photos_delete_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'rental-inspection-photos'
  and (storage.foldername(name))[1] = (select private.current_organization_id()::text)
  and (select private.current_app_role()) in ('owner', 'admin')
);

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------

alter table public.inspection_checklist_templates enable row level security;
alter table public.inspection_checklist_template_items enable row level security;
alter table public.rental_inspections enable row level security;
alter table public.rental_inspection_items enable row level security;
alter table public.rental_inspection_photos enable row level security;
alter table public.vehicle_known_damages enable row level security;

revoke all on table public.inspection_checklist_templates from anon, authenticated;
revoke all on table public.inspection_checklist_template_items from anon, authenticated;
revoke all on table public.rental_inspections from anon, authenticated;
revoke all on table public.rental_inspection_items from anon, authenticated;
revoke all on table public.rental_inspection_photos from anon, authenticated;
revoke all on table public.vehicle_known_damages from anon, authenticated;

grant select, insert, update, delete on table public.inspection_checklist_templates
  to authenticated;
grant select, insert, update, delete on table public.inspection_checklist_template_items
  to authenticated;
grant select, insert, update, delete on table public.rental_inspections to authenticated;
grant select, insert, update, delete on table public.rental_inspection_items to authenticated;
grant select, insert, update, delete on table public.rental_inspection_photos to authenticated;
grant select, insert, update, delete on table public.vehicle_known_damages to authenticated;

grant all on table public.inspection_checklist_templates to service_role;
grant all on table public.inspection_checklist_template_items to service_role;
grant all on table public.rental_inspections to service_role;
grant all on table public.rental_inspection_items to service_role;
grant all on table public.rental_inspection_photos to service_role;
grant all on table public.vehicle_known_damages to service_role;

grant usage on type public.inspection_type to authenticated, service_role;
grant usage on type public.inspection_item_status to authenticated, service_role;
grant usage on type public.inspection_photo_kind to authenticated, service_role;
grant usage on type public.inspection_cleanliness to authenticated, service_role;
grant usage on type public.inspection_odor to authenticated, service_role;

create policy inspection_templates_select_org
on public.inspection_checklist_templates for select to authenticated
using (organization_id = (select private.current_organization_id()));

create policy inspection_templates_write_admin
on public.inspection_checklist_templates for all to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) in ('owner', 'admin')
)
with check (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) in ('owner', 'admin')
);

create policy inspection_template_items_select_org
on public.inspection_checklist_template_items for select to authenticated
using (
  exists (
    select 1 from public.inspection_checklist_templates t
    where t.id = template_id
      and t.organization_id = (select private.current_organization_id())
  )
);

create policy inspection_template_items_write_admin
on public.inspection_checklist_template_items for all to authenticated
using (
  exists (
    select 1 from public.inspection_checklist_templates t
    where t.id = template_id
      and t.organization_id = (select private.current_organization_id())
      and (select private.current_app_role()) in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1 from public.inspection_checklist_templates t
    where t.id = template_id
      and t.organization_id = (select private.current_organization_id())
      and (select private.current_app_role()) in ('owner', 'admin')
  )
);

create policy rental_inspections_select_org
on public.rental_inspections for select to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) in ('owner', 'admin', 'staff')
);

create policy rental_inspections_write_staff
on public.rental_inspections for all to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) in ('owner', 'admin', 'staff')
)
with check (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) in ('owner', 'admin', 'staff')
);

create policy rental_inspection_items_select_org
on public.rental_inspection_items for select to authenticated
using (
  exists (
    select 1 from public.rental_inspections i
    where i.id = inspection_id
      and i.organization_id = (select private.current_organization_id())
      and (select private.current_app_role()) in ('owner', 'admin', 'staff')
  )
);

create policy rental_inspection_items_write_staff
on public.rental_inspection_items for all to authenticated
using (
  exists (
    select 1 from public.rental_inspections i
    where i.id = inspection_id
      and i.organization_id = (select private.current_organization_id())
      and (select private.current_app_role()) in ('owner', 'admin', 'staff')
  )
)
with check (
  exists (
    select 1 from public.rental_inspections i
    where i.id = inspection_id
      and i.organization_id = (select private.current_organization_id())
      and (select private.current_app_role()) in ('owner', 'admin', 'staff')
  )
);

create policy rental_inspection_photos_select_org
on public.rental_inspection_photos for select to authenticated
using (
  exists (
    select 1 from public.rental_inspections i
    where i.id = inspection_id
      and i.organization_id = (select private.current_organization_id())
      and (select private.current_app_role()) in ('owner', 'admin', 'staff')
  )
);

create policy rental_inspection_photos_write_staff
on public.rental_inspection_photos for all to authenticated
using (
  exists (
    select 1 from public.rental_inspections i
    where i.id = inspection_id
      and i.organization_id = (select private.current_organization_id())
      and (select private.current_app_role()) in ('owner', 'admin', 'staff')
  )
)
with check (
  exists (
    select 1 from public.rental_inspections i
    where i.id = inspection_id
      and i.organization_id = (select private.current_organization_id())
      and (select private.current_app_role()) in ('owner', 'admin', 'staff')
  )
);

create policy vehicle_known_damages_select_org
on public.vehicle_known_damages for select to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) in ('owner', 'admin', 'staff')
);

create policy vehicle_known_damages_write_staff
on public.vehicle_known_damages for all to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) in ('owner', 'admin', 'staff')
)
with check (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) in ('owner', 'admin', 'staff')
);

-- ---------------------------------------------------------------------------
-- Default checklist seed helper
-- ---------------------------------------------------------------------------

create or replace function private.default_inspection_checklist_items()
returns table (
  area_code text,
  label text,
  item_group text,
  body_map_zone text,
  sort_order integer
)
language sql
immutable
set search_path = ''
as $$
  select * from (values
    ('front_bumper', 'Front bumper', 'exterior', 'front_bumper', 10),
    ('hood', 'Hood', 'exterior', 'hood', 20),
    ('roof', 'Roof', 'exterior', 'roof', 30),
    ('trunk', 'Trunk / hatch', 'exterior', 'trunk', 40),
    ('rear_bumper', 'Rear bumper', 'exterior', 'rear_bumper', 50),
    ('fender_fl', 'Front left fender', 'exterior', 'fender_fl', 60),
    ('fender_fr', 'Front right fender', 'exterior', 'fender_fr', 70),
    ('door_fl', 'Front left door', 'exterior', 'door_fl', 80),
    ('door_fr', 'Front right door', 'exterior', 'door_fr', 90),
    ('door_rl', 'Rear left door', 'exterior', 'door_rl', 100),
    ('door_rr', 'Rear right door', 'exterior', 'door_rr', 110),
    ('fender_rl', 'Rear left quarter', 'exterior', 'fender_rl', 120),
    ('fender_rr', 'Rear right quarter', 'exterior', 'fender_rr', 130),
    ('mirror_l', 'Left mirror', 'exterior', 'mirror_l', 140),
    ('mirror_r', 'Right mirror', 'exterior', 'mirror_r', 150),
    ('windshield', 'Windshield', 'glass_lights', 'windshield', 160),
    ('glass_rear', 'Rear glass', 'glass_lights', 'glass_rear', 170),
    ('headlights', 'Headlights', 'glass_lights', 'headlights', 180),
    ('taillights', 'Taillights', 'glass_lights', 'taillights', 190),
    ('tire_fl', 'Front left tire', 'wheels', 'tire_fl', 200),
    ('tire_fr', 'Front right tire', 'wheels', 'tire_fr', 210),
    ('tire_rl', 'Rear left tire', 'wheels', 'tire_rl', 220),
    ('tire_rr', 'Rear right tire', 'wheels', 'tire_rr', 230),
    ('spare_tire', 'Spare / repair kit', 'wheels', null, 240),
    ('seats', 'Seats / upholstery', 'interior', null, 250),
    ('dashboard', 'Dashboard / controls', 'interior', null, 260),
    ('ac', 'A/C / blower', 'interior', null, 270),
    ('seatbelts', 'Seatbelts', 'interior', null, 280),
    ('infotainment', 'Infotainment / USB', 'interior', null, 290),
    ('keys', 'Keys / remote', 'accessories', null, 300),
    ('documents', 'Registration / insurance copy', 'accessories', null, 310),
    ('tools', 'Jack / tools / triangle', 'accessories', null, 320),
    ('mats', 'Floor mats', 'accessories', null, 330)
  ) as t(area_code, label, item_group, body_map_zone, sort_order);
$$;

create or replace function private.ensure_default_inspection_template(
  p_organization_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template_id uuid;
begin
  select id into v_template_id
  from public.inspection_checklist_templates
  where organization_id = p_organization_id
    and is_default
    and is_active
  limit 1;

  if v_template_id is not null then
    return v_template_id;
  end if;

  insert into public.inspection_checklist_templates (
    organization_id, name, vehicle_category, is_default, is_active
  )
  values (p_organization_id, 'Standard vehicle inspection', null, true, true)
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
$$;

revoke all on function private.ensure_default_inspection_template(uuid) from public;
grant execute on function private.ensure_default_inspection_template(uuid) to service_role;

-- Seed defaults for existing organizations.
do $$
declare
  r record;
begin
  for r in select id from public.organizations loop
    perform private.ensure_default_inspection_template(r.id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Resolve checklist for a rental (category-specific or default)
-- ---------------------------------------------------------------------------

create or replace function public.get_inspection_checklist_for_rental(
  p_rental_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid := private.current_organization_id();
  v_role public.app_role := private.current_app_role();
  v_category text;
  v_template public.inspection_checklist_templates%rowtype;
begin
  if v_organization_id is null
    or v_role not in ('owner', 'admin', 'staff') then
    raise exception 'Staff access is required.' using errcode = 'insufficient_privilege';
  end if;

  select v.category into v_category
  from public.rentals r
  join public.vehicles v on v.id = r.vehicle_id
  where r.id = p_rental_id
    and r.organization_id = v_organization_id;

  if not found then
    raise exception 'Rental was not found.' using errcode = 'no_data_found';
  end if;

  perform private.ensure_default_inspection_template(v_organization_id);

  if v_category is not null then
    select * into v_template
    from public.inspection_checklist_templates t
    where t.organization_id = v_organization_id
      and t.is_active
      and t.vehicle_category is not null
      and lower(t.vehicle_category) = lower(v_category)
    order by t.created_at desc
    limit 1;
  end if;

  if v_template.id is null then
    select * into v_template
    from public.inspection_checklist_templates t
    where t.organization_id = v_organization_id
      and t.is_active
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
$$;

revoke all on function public.get_inspection_checklist_for_rental(uuid) from public;
grant execute on function public.get_inspection_checklist_for_rental(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Submit pickup/return inspection + transition rental
-- ---------------------------------------------------------------------------

create or replace function public.submit_rental_inspection(
  p_rental_id uuid,
  p_inspection_type public.inspection_type,
  p_odometer numeric,
  p_fuel_level numeric,
  p_cleanliness public.inspection_cleanliness,
  p_odor public.inspection_odor,
  p_notes text,
  p_items jsonb,
  p_photos jsonb default '[]'::jsonb,
  p_customer_signature_path text default null,
  p_customer_acknowledged boolean default false,
  p_fuel_charge_amount numeric default null,
  p_fuel_charge_note text default null,
  p_damage_charge_amount numeric default null,
  p_damage_charge_note text default null,
  p_template_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid := private.current_organization_id();
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
begin
  if v_organization_id is null
    or v_role not in ('owner', 'admin', 'staff') then
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

  select * into v_rental
  from public.rentals
  where id = p_rental_id
    and organization_id = v_organization_id
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
    private.ensure_default_inspection_template(v_organization_id)
  );

  insert into public.rental_inspections (
    organization_id,
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
    v_organization_id,
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

    -- Carry open damage onto the vehicle profile when none is open for the area.
    if (v_item ->> 'status') is not null
      and (v_item ->> 'status') <> 'ok'
      and not exists (
        select 1
        from public.vehicle_known_damages d
        where d.vehicle_id = v_rental.vehicle_id
          and d.organization_id = v_organization_id
          and d.area_code = (v_item ->> 'area_code')
          and not d.is_resolved
      ) then
      insert into public.vehicle_known_damages (
        organization_id,
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
        v_organization_id,
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

  if p_photos is not null and jsonb_typeof(p_photos) = 'array' then
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
  end if;

  -- Tracking consent at pickup (same rule as transition action).
  if p_inspection_type = 'pickup' and v_rental.tracking_consent_at is null then
    update public.rentals
    set tracking_consent_at = now()
    where id = p_rental_id
      and organization_id = v_organization_id
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
  where id = p_rental_id
    and organization_id = v_organization_id;

  if p_inspection_type = 'return' then
    update public.vehicles
    set current_odometer = p_odometer,
        updated_at = now()
    where id = v_rental.vehicle_id
      and organization_id = v_organization_id;
  end if;

  perform private.write_audit_log(
    v_organization_id,
    'rental.inspection_submitted',
    'rental',
    p_rental_id,
    null,
    jsonb_build_object(
      'inspection_id', v_inspection_id,
      'inspection_type', p_inspection_type,
      'status', v_next_status,
      'odometer', p_odometer,
      'fuel_level', p_fuel_level
    ),
    '{}'::jsonb
  );

  return v_inspection_id;
end;
$$;

revoke all on function public.submit_rental_inspection(
  uuid, public.inspection_type, numeric, numeric, public.inspection_cleanliness,
  public.inspection_odor, text, jsonb, jsonb, text, boolean, numeric, text,
  numeric, text, uuid
) from public;
grant execute on function public.submit_rental_inspection(
  uuid, public.inspection_type, numeric, numeric, public.inspection_cleanliness,
  public.inspection_odor, text, jsonb, jsonb, text, boolean, numeric, text,
  numeric, text, uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- Customer condition report (signed-in renter by email match)
-- ---------------------------------------------------------------------------

create or replace function public.get_my_booking_condition_report(
  p_rental_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_rental public.rentals%rowtype;
  v_vehicle record;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = 'insufficient_privilege';
  end if;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email = '' then
    raise exception 'A verified email is required to view condition reports.';
  end if;

  select r.* into v_rental
  from public.rentals r
  join public.customers c on c.id = r.customer_id
  where r.id = p_rental_id
    and c.email is not null
    and lower(c.email) = v_email;

  if not found then
    raise exception 'Booking was not found.' using errcode = 'no_data_found';
  end if;

  select
    v.id,
    v.name,
    v.make,
    v.model,
    v.plate_number,
    v.photo_url
  into v_vehicle
  from public.vehicles v
  where v.id = v_rental.vehicle_id;

  return jsonb_build_object(
    'rental', jsonb_build_object(
      'id', v_rental.id,
      'reference_number', v_rental.reference_number,
      'status', v_rental.status,
      'start_at', v_rental.start_at,
      'expected_return_at', v_rental.expected_return_at,
      'actual_return_at', v_rental.actual_return_at,
      'starting_odometer', v_rental.starting_odometer,
      'ending_odometer', v_rental.ending_odometer,
      'starting_fuel_level', v_rental.starting_fuel_level,
      'ending_fuel_level', v_rental.ending_fuel_level
    ),
    'vehicle', jsonb_build_object(
      'id', v_vehicle.id,
      'name', v_vehicle.name,
      'make', v_vehicle.make,
      'model', v_vehicle.model,
      'plate_number', v_vehicle.plate_number,
      'photo_url', v_vehicle.photo_url
    ),
    'inspections', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'inspection_type', i.inspection_type,
          'odometer', i.odometer,
          'fuel_level', i.fuel_level,
          'cleanliness', i.cleanliness,
          'odor', i.odor,
          'notes', i.notes,
          'customer_acknowledged_at', i.customer_acknowledged_at,
          'inspected_at', i.inspected_at,
          'items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'area_code', it.area_code,
                'label', it.label,
                'item_group', it.item_group,
                'status', it.status,
                'severity', it.severity,
                'notes', it.notes
              )
              order by it.label
            )
            from public.rental_inspection_items it
            where it.inspection_id = i.id
          ), '[]'::jsonb),
          'photos', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'storage_path', p.storage_path,
                'kind', p.kind,
                'caption', p.caption
              )
              order by p.created_at
            )
            from public.rental_inspection_photos p
            where p.inspection_id = i.id
              and p.kind <> 'signature'
          ), '[]'::jsonb)
        )
        order by i.inspected_at
      )
      from public.rental_inspections i
      where i.rental_id = v_rental.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_my_booking_condition_report(uuid) from public;
grant execute on function public.get_my_booking_condition_report(uuid) to authenticated;

-- Clone default template into a category-specific template.
create or replace function public.clone_inspection_template_for_category(
  p_vehicle_category text,
  p_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid := private.current_organization_id();
  v_role public.app_role := private.current_app_role();
  v_source_id uuid;
  v_new_id uuid;
  v_category text := nullif(trim(p_vehicle_category), '');
begin
  if v_organization_id is null
    or v_role not in ('owner', 'admin') then
    raise exception 'Admin access is required.' using errcode = 'insufficient_privilege';
  end if;
  if v_category is null then
    raise exception 'Vehicle category is required.';
  end if;

  v_source_id := private.ensure_default_inspection_template(v_organization_id);

  insert into public.inspection_checklist_templates (
    organization_id, name, vehicle_category, is_default, is_active
  )
  values (
    v_organization_id,
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
$$;

revoke all on function public.clone_inspection_template_for_category(text, text) from public;
grant execute on function public.clone_inspection_template_for_category(text, text)
  to authenticated;
