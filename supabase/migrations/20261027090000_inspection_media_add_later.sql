-- Inspection photos and videos added after submit.
--
-- An inspection now needs only two photos to be submitted (checked by the
-- app). Videos and further photos upload in the background; when one fails,
-- or staff skip the wait, it can be attached to the inspection afterwards —
-- until the rental is completed or cancelled. Late additions are marked, with
-- who added them, so the report can tell them apart from media recorded at
-- the handover.

alter table public.rental_inspection_photos
  add column if not exists added_late boolean not null default false,
  add column if not exists added_by uuid;

alter table public.rental_inspection_photos
  drop constraint if exists rental_inspection_photos_added_by_fkey;
alter table public.rental_inspection_photos
  add constraint rental_inspection_photos_added_by_fkey
  foreign key (added_by) references public.profiles (id) on delete set null;

comment on column public.rental_inspection_photos.added_late is
  'Attached after the inspection was submitted (add_rental_inspection_media), not at the handover.';
comment on column public.rental_inspection_photos.added_by is
  'Who attached a late photo or video.';

create or replace function public.add_rental_inspection_media(
  p_inspection_id uuid,
  p_photos jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inspection public.rental_inspections%rowtype;
  v_status public.rental_status;
  v_existing integer;
  v_photo jsonb;
  v_path text;
  v_count integer := 0;
begin
  if not (select private.is_org_staff()) then
    raise exception 'Staff access is required.' using errcode = 'insufficient_privilege';
  end if;
  if p_photos is null
    or jsonb_typeof(p_photos) <> 'array'
    or jsonb_array_length(p_photos) = 0 then
    raise exception 'Add at least one photo or video.' using errcode = 'check_violation';
  end if;

  select * into v_inspection
  from public.rental_inspections
  where id = p_inspection_id;
  if not found then
    raise exception 'Inspection was not found.' using errcode = 'no_data_found';
  end if;

  select status into v_status
  from public.rentals
  where id = v_inspection.rental_id
  for update;
  if v_status in ('completed', 'cancelled') then
    raise exception 'Photos and videos can only be added until the rental is completed.'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_existing
  from public.rental_inspection_photos
  where inspection_id = p_inspection_id
    and kind not in ('signature', 'damage_closeup');
  if v_existing + jsonb_array_length(p_photos) > 40 then
    raise exception 'An inspection holds up to 40 photos and videos.'
      using errcode = 'check_violation';
  end if;

  for v_photo in
    select value from jsonb_array_elements(p_photos)
  loop
    v_path := trim(coalesce(v_photo ->> 'storage_path', ''));
    -- Uploaded by the browser: only this rental's folder, only media files.
    if v_path !~* (
      '^' || v_inspection.rental_id::text || '/[a-z0-9_-]+\.(jpg|jpeg|png|webp|gif|mp4)$'
    ) then
      raise exception 'A photo or video path is invalid.' using errcode = 'check_violation';
    end if;

    insert into public.rental_inspection_photos (
      inspection_id,
      storage_path,
      kind,
      added_late,
      added_by
    )
    values (p_inspection_id, v_path, 'other', true, auth.uid());
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.add_rental_inspection_media(uuid, jsonb)
  from public, anon;
grant execute on function public.add_rental_inspection_media(uuid, jsonb)
  to authenticated;
