-- ===========================================================================
-- Vehicle slugs: readable car URLs (/cars/toyota-avanza-automatic).
--
-- Every car gets a slug from its make and name, the same words as its search
-- title (vehicleSeoTitle): the make leads unless it is a placeholder ("NA")
-- or the name already says it. The slug follows the car: renaming it, or
-- filling in the make later, moves the slug, and the old one is kept so its
-- links redirect. Two cars with the same name are told apart by colour, then
-- year, then a number.
--
-- 1. private.slugify, private.vehicle_slug_base.
-- 2. vehicles.slug (unique), vehicle_slug_redirects, and the trigger that
--    keeps both current. Existing cars are backfilled oldest first.
-- 3. resolve_public_vehicle_slug: a slug (current or old) to the car.
-- 4. get_public_vehicle and list_public_available_vehicles return the slug.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Slug helpers
-- ---------------------------------------------------------------------------
create function private.slugify(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(
    regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', '-', 'g'),
    '-'
  );
$$;

-- Make + name, the make dropped when it is a placeholder or already in the name.
create function private.vehicle_slug_base(p_name text, p_make text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(
      private.slugify(
        case
          when btrim(coalesce(p_make, '')) ~* '^(n/?a|none|-+|\.+|tbd)?$'
            or position(lower(btrim(p_make)) in lower(coalesce(p_name, ''))) > 0
            then p_name
          else btrim(p_make) || ' ' || coalesce(p_name, '')
        end
      ),
      ''
    ),
    'car'
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. The slug, its history, and the trigger
-- ---------------------------------------------------------------------------
alter table public.vehicles
  add column slug text
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

create table public.vehicle_slug_redirects (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.vehicle_slug_redirects is
  'Slugs a car used to have, so old /cars/<slug> links redirect to its current page.';

-- Only reached through resolve_public_vehicle_slug.
alter table public.vehicle_slug_redirects enable row level security;
alter table public.vehicle_slug_redirects force row level security;
revoke all on public.vehicle_slug_redirects from public, anon, authenticated;

create function private.set_vehicle_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_base text := private.vehicle_slug_base(new.name, new.make);
  v_color text := private.slugify(new.color);
  v_candidate text;
  v_n integer := 2;
begin
  -- Same words as before: keep the slug, with any tiebreak it carries
  -- (colour, colour and year, or a number). Slug pieces are [a-z0-9-] only,
  -- so they are safe inside the pattern.
  if new.slug is not null and new.slug ~ (
    '^' || v_base
    || '(-[0-9]+'
    || case when v_color <> '' then '|-' || v_color || '(-[0-9]{4})?' else '' end
    || ')?$'
  ) then
    return new;
  end if;

  foreach v_candidate in array array[
    v_base,
    case when v_color <> '' then v_base || '-' || v_color end,
    case when v_color <> '' and new.year is not null
      then v_base || '-' || v_color || '-' || new.year end
  ]
  loop
    if v_candidate is not null and not exists (
      select 1 from public.vehicles v
      where v.slug = v_candidate and v.id <> new.id
    ) then
      exit;
    end if;
    v_candidate := null;
  end loop;

  while v_candidate is null loop
    if not exists (
      select 1 from public.vehicles v
      where v.slug = v_base || '-' || v_n and v.id <> new.id
    ) then
      v_candidate := v_base || '-' || v_n;
    end if;
    v_n := v_n + 1;
  end loop;

  if tg_op = 'UPDATE' and old.slug is not null and old.slug <> v_candidate then
    insert into public.vehicle_slug_redirects (slug, vehicle_id)
    values (old.slug, new.id)
    on conflict (slug) do update set vehicle_id = excluded.vehicle_id;
  end if;
  -- A live slug is never also a redirect.
  delete from public.vehicle_slug_redirects r where r.slug = v_candidate;

  new.slug := v_candidate;
  return new;
end;
$$;

create trigger vehicles_set_slug
  before insert or update of name, make, color, year, slug
  on public.vehicles
  for each row execute function private.set_vehicle_slug();

-- Backfill one car at a time, oldest first, so the first car keeps the plain slug.
do $$
declare
  v_id uuid;
begin
  for v_id in select id from public.vehicles order by created_at, id loop
    update public.vehicles set slug = null where id = v_id;
  end loop;
end;
$$;

alter table public.vehicles alter column slug set not null;
alter table public.vehicles add constraint vehicles_slug_key unique (slug);

comment on column public.vehicles.slug is
  'URL name for /cars/<slug>, kept in step with make and name by vehicles_set_slug.';

grant select (slug) on public.vehicles to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Slug lookup for the public car pages
-- ---------------------------------------------------------------------------
create function public.resolve_public_vehicle_slug(p_slug text)
returns table (vehicle_id uuid, slug text)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.slug
  from public.vehicles v
  cross join public.company_profile o
  where o.is_active
    and o.show_on_public_site
    and v.status <> 'inactive'
    and v.id = coalesce(
      (select v2.id from public.vehicles v2 where v2.slug = p_slug),
      (select r.vehicle_id from public.vehicle_slug_redirects r where r.slug = p_slug)
    );
$$;

revoke all on function public.resolve_public_vehicle_slug(text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_public_vehicle_slug(text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Public car reads return the slug
-- ---------------------------------------------------------------------------
drop function public.get_public_vehicle(uuid);
create function public.get_public_vehicle(p_vehicle_id uuid)
returns table (
  id uuid, name text, make text, model text, year smallint, category text,
  transmission public.vehicle_transmission, fuel_type public.vehicle_fuel_type,
  seating_capacity smallint, photo_url text, status public.vehicle_status,
  daily_rate numeric, color text, showcase_image_url text,
  half_day_rate numeric, hourly_rate numeric, slug text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    v.id, v.name, v.make, v.model, v.year, v.category, v.transmission,
    v.fuel_type, v.seating_capacity, v.photo_url,
    case
      when v.status = 'available' and not public.vehicle_has_required_gallery(v.id)
        then 'maintenance'::public.vehicle_status
      else v.status
    end,
    v.daily_rate, v.color, v.showcase_image_url, v.half_day_rate, v.hourly_rate,
    v.slug
  from public.vehicles v
  cross join public.company_profile o
  where v.id = p_vehicle_id
    and o.is_active
    and o.show_on_public_site
    and v.status <> 'inactive';
$$;

revoke all on function public.get_public_vehicle(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_vehicle(uuid)
  to anon, authenticated;

drop function public.list_public_available_vehicles(date, date);
create function public.list_public_available_vehicles(
  p_start_date date default null,
  p_end_date date default null
)
returns table (
  id uuid, name text, make text, model text, year smallint, category text,
  transmission public.vehicle_transmission, fuel_type public.vehicle_fuel_type,
  seating_capacity smallint, photo_url text, daily_rate numeric,
  color text, showcase_image_url text, half_day_rate numeric, hourly_rate numeric,
  slug text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    v.id, v.name, v.make, v.model, v.year, v.category,
    v.transmission, v.fuel_type, v.seating_capacity, v.photo_url, v.daily_rate,
    v.color, v.showcase_image_url, v.half_day_rate, v.hourly_rate, v.slug
  from public.vehicles v
  cross join public.company_profile o
  where o.is_active
    and o.show_on_public_site
    and v.status = 'available'
    and public.vehicle_has_required_gallery(v.id)
    and (
      p_start_date is null
      or p_end_date is null
      or p_end_date < p_start_date
      or not exists (
        select 1
        from public.rentals r
        where r.vehicle_id = v.id
          and private.rental_holds_dates(r.status, r.payment_status)
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

revoke all on function public.list_public_available_vehicles(date, date)
  from public, anon, authenticated, service_role;
grant execute on function public.list_public_available_vehicles(date, date)
  to anon, authenticated;
