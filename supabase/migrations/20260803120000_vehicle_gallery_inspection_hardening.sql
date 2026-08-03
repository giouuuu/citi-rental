-- Vehicle gallery (6 required angles), inspection photo hardening,
-- damage penalty ledger posting, and rental transition inspection gates.

-- ---------------------------------------------------------------------------
-- Enum safety for DBs that already applied the prior inspections migration
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'inspection_photo_kind'
      and e.enumlabel = 'overview_interior'
  ) then
    alter type public.inspection_photo_kind add value 'overview_interior';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'inspection_photo_kind'
      and e.enumlabel = 'overview_dashboard'
  ) then
    alter type public.inspection_photo_kind add value 'overview_dashboard';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Vehicle gallery
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'vehicle_photo_kind'
  ) then
    create type public.vehicle_photo_kind as enum (
      'front',
      'rear',
      'left',
      'right',
      'interior',
      'dashboard'
    );
  end if;
end
$$;

create table if not exists public.vehicle_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  kind public.vehicle_photo_kind not null,
  storage_path text not null check (char_length(trim(storage_path)) between 1 and 500),
  public_url text not null check (char_length(trim(public_url)) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vehicle_id, kind),
  constraint vehicle_photos_tenant_fkey
    foreign key (organization_id, vehicle_id)
    references public.vehicles (organization_id, id) on delete cascade
);

create index if not exists vehicle_photos_org_vehicle_idx
  on public.vehicle_photos (organization_id, vehicle_id);

drop trigger if exists vehicle_photos_set_updated_at on public.vehicle_photos;
create trigger vehicle_photos_set_updated_at
before update on public.vehicle_photos
for each row execute function private.set_updated_at();

comment on table public.vehicle_photos is
  'Required fleet gallery slots: front, rear, left, right, interior, dashboard.';

alter table public.vehicle_photos enable row level security;
alter table public.vehicle_photos force row level security;

revoke all on table public.vehicle_photos from anon, authenticated;
grant select on table public.vehicle_photos to anon, authenticated;
grant insert, update, delete on table public.vehicle_photos to authenticated;
grant all on table public.vehicle_photos to service_role;

grant usage on type public.vehicle_photo_kind to anon, authenticated, service_role;

drop policy if exists vehicle_photos_select_public on public.vehicle_photos;
create policy vehicle_photos_select_public
on public.vehicle_photos
for select
to anon, authenticated
using (true);

drop policy if exists vehicle_photos_write_admin on public.vehicle_photos;
create policy vehicle_photos_write_admin
on public.vehicle_photos
for all
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) in ('owner', 'admin')
)
with check (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) in ('owner', 'admin')
);

-- Backfill front slot from legacy cover photo when possible.
insert into public.vehicle_photos (
  organization_id, vehicle_id, kind, storage_path, public_url
)
select
  v.organization_id,
  v.id,
  'front'::public.vehicle_photo_kind,
  coalesce(
    nullif(substring(v.photo_url from '/vehicle-photos/(.+)$'), ''),
    'legacy/' || v.id::text || '/front'
  ),
  v.photo_url
from public.vehicles v
where v.photo_url is not null
  and length(trim(v.photo_url)) > 0
  and not exists (
    select 1 from public.vehicle_photos p
    where p.vehicle_id = v.id and p.kind = 'front'
  );

create or replace function public.vehicle_has_required_gallery(p_vehicle_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (
      select count(distinct p.kind) = 6
      from public.vehicle_photos p
      where p.vehicle_id = p_vehicle_id
        and p.kind in ('front', 'rear', 'left', 'right', 'interior', 'dashboard')
    ),
    false
  );
$$;

revoke all on function public.vehicle_has_required_gallery(uuid) from public;
grant execute on function public.vehicle_has_required_gallery(uuid) to authenticated, service_role;

create or replace function private.enforce_vehicle_gallery_for_available()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'available'
    and not public.vehicle_has_required_gallery(new.id) then
    raise exception
      'Upload all 6 required vehicle photos (front, rear, left, right, interior, dashboard) before setting status to available.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists vehicles_require_gallery_when_available on public.vehicles;
-- UPDATE only: create flow uploads the gallery after the row exists.
create trigger vehicles_require_gallery_when_available
before update of status on public.vehicles
for each row
when (new.status = 'available' and old.status is distinct from 'available')
execute function private.enforce_vehicle_gallery_for_available();

-- ---------------------------------------------------------------------------
-- Link damage penalty payment on rental inspections
-- ---------------------------------------------------------------------------

alter table public.rental_inspections
  add column if not exists damage_payment_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'rental_inspections_damage_payment_fkey'
  ) then
    alter table public.rental_inspections
      add constraint rental_inspections_damage_payment_fkey
      foreign key (organization_id, damage_payment_id)
      references public.payments (organization_id, id)
      on delete set null;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Hard gates: cannot start/complete rental without matching inspection
-- ---------------------------------------------------------------------------

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

  if p_status = 'active'
    and not exists (
      select 1 from public.rental_inspections i
      where i.rental_id = p_rental_id
        and i.organization_id = v_organization_id
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
        and i.organization_id = v_organization_id
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

-- ---------------------------------------------------------------------------
-- Harden submit_rental_inspection: required photos + damage penalty payment
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
  v_required_kind text;
  v_payment_id uuid;
  v_damage_note text;
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
    and p_damage_charge_amount is not null
    and p_damage_charge_amount > 0 then
    v_damage_note := coalesce(
      nullif(trim(coalesce(p_damage_charge_note, '')), ''),
      'Damage penalty from return inspection'
    );
    insert into public.payments (
      organization_id,
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
      v_organization_id,
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

    perform private.refresh_rental_payment_summary(p_rental_id);
  end if;

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
      'fuel_level', p_fuel_level,
      'damage_payment_id', v_payment_id
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
