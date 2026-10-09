-- Rental agreement signed at release.
--
-- When staff release a car (pickup inspection), the renter signs once and the
-- signature lands on both the condition report and the rental agreement. The
-- agreement is stored as a frozen snapshot: the wording, fines, renter and
-- company details, and both signatures as they were at signing, so later
-- changes to settings or the customer record never alter a signed contract.

-- ---------------------------------------------------------------------------
-- Company details printed on the agreement
-- ---------------------------------------------------------------------------

alter table public.company_profile
  add column if not exists legal_name text
    check (legal_name is null or char_length(legal_name) <= 160),
  add column if not exists business_address text
    check (business_address is null or char_length(business_address) <= 300),
  add column if not exists contact_email text
    check (contact_email is null or char_length(contact_email) <= 200),
  add column if not exists agreement_signature_path text
    check (agreement_signature_path is null or char_length(agreement_signature_path) <= 500);

comment on column public.company_profile.legal_name is
  'Registered business name printed on the rental agreement, e.g. Zeke''s Car Rental Services.';
comment on column public.company_profile.agreement_signature_path is
  'Saved company e-signature (rental-inspection-photos bucket) applied to agreements at release.';

grant select (legal_name, business_address, contact_email, agreement_signature_path)
  on public.company_profile to authenticated;
grant update (legal_name, business_address, contact_email, agreement_signature_path)
  on public.company_profile to authenticated;

-- Details from the paper agreement, only where nothing is set yet. The phone
-- is left alone: contact_phone also drives the public site's chat button.
update public.company_profile
set
  legal_name = coalesce(legal_name, 'Zeke''s Car Rental Services'),
  business_address = coalesce(
    business_address,
    'Block 24 Lot 19 Grand Terrace Heights, Consolacion, Philippines, 6001'
  ),
  contact_email = coalesce(contact_email, 'zekecebucarrental@gmail.com');

-- ---------------------------------------------------------------------------
-- Signed agreements
-- ---------------------------------------------------------------------------

create table if not exists public.rental_agreements (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null unique references public.rentals (id) on delete cascade,
  inspection_id uuid references public.rental_inspections (id) on delete set null,
  template_version text not null check (char_length(template_version) between 1 and 40),
  terms jsonb not null check (jsonb_typeof(terms) = 'object'),
  company_name text not null,
  company_address text,
  company_phone text,
  company_email text,
  company_signature_path text not null,
  company_signed_by uuid references public.profiles (id) on delete set null,
  renter_name text not null,
  renter_license_number text not null,
  renter_address text not null check (char_length(trim(renter_address)) between 1 and 300),
  renter_signature_path text not null,
  rental_reference text,
  vehicle_label text,
  plate_number text,
  start_at timestamptz,
  expected_return_at timestamptz,
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.rental_agreements is
  'Rental agreement signed at release: a frozen snapshot of the terms, parties and signatures. Written only by submit_rental_inspection.';

alter table public.rental_agreements enable row level security;
revoke all on table public.rental_agreements from anon, authenticated;
grant select on table public.rental_agreements to authenticated;
grant all on table public.rental_agreements to service_role;

drop policy if exists rental_agreements_select_staff on public.rental_agreements;
create policy rental_agreements_select_staff
on public.rental_agreements for select to authenticated
using ((select private.is_org_staff()));

create or replace function private.record_rental_agreement(
  p_rental_id uuid,
  p_inspection_id uuid,
  p_agreement jsonb,
  p_renter_signature_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rental public.rentals%rowtype;
  v_customer public.customers%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_company public.company_profile%rowtype;
  v_address text := nullif(trim(coalesce(p_agreement ->> 'renter_address', '')), '');
  v_company_signature text :=
    nullif(trim(coalesce(p_agreement ->> 'company_signature_path', '')), '');
  v_renter_signature text := nullif(trim(coalesce(p_renter_signature_path, '')), '');
  v_agreement_id uuid;
begin
  if not (select private.is_org_staff()) then
    raise exception 'Staff access is required.' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_agreement) <> 'object'
    or jsonb_typeof(p_agreement -> 'terms') is distinct from 'object'
    or nullif(trim(coalesce(p_agreement ->> 'template_version', '')), '') is null then
    raise exception 'The rental agreement is incomplete.' using errcode = 'check_violation';
  end if;
  if coalesce((p_agreement ->> 'accepted')::boolean, false) is not true then
    raise exception 'The renter must agree to the rental agreement.'
      using errcode = 'check_violation';
  end if;
  if v_renter_signature is null then
    raise exception 'The renter must sign the rental agreement.'
      using errcode = 'check_violation';
  end if;
  if v_company_signature is null then
    raise exception 'The company signature is missing from the rental agreement.'
      using errcode = 'check_violation';
  end if;
  if v_address is null then
    raise exception 'Enter the renter''s address for the rental agreement.'
      using errcode = 'check_violation';
  end if;

  select * into v_rental from public.rentals where id = p_rental_id;
  if not found then
    raise exception 'Rental was not found.' using errcode = 'no_data_found';
  end if;
  select * into v_customer from public.customers where id = v_rental.customer_id;
  select * into v_vehicle from public.vehicles where id = v_rental.vehicle_id;
  select * into v_company from public.company_profile limit 1;

  -- What staff typed at release is the renter's current address.
  update public.customers
  set address = v_address, updated_at = now()
  where id = v_rental.customer_id
    and address is distinct from v_address;

  insert into public.rental_agreements (
    rental_id,
    inspection_id,
    template_version,
    terms,
    company_name,
    company_address,
    company_phone,
    company_email,
    company_signature_path,
    company_signed_by,
    renter_name,
    renter_license_number,
    renter_address,
    renter_signature_path,
    rental_reference,
    vehicle_label,
    plate_number,
    start_at,
    expected_return_at,
    signed_at
  )
  values (
    p_rental_id,
    p_inspection_id,
    p_agreement ->> 'template_version',
    p_agreement -> 'terms',
    coalesce(nullif(trim(v_company.legal_name), ''), v_company.name),
    v_company.business_address,
    v_company.contact_phone,
    v_company.contact_email,
    v_company_signature,
    auth.uid(),
    v_customer.full_name,
    v_customer.drivers_license_number,
    v_address,
    v_renter_signature,
    v_rental.reference_number,
    coalesce(
      nullif(trim(v_vehicle.name), ''),
      nullif(trim(concat_ws(' ', v_vehicle.make, v_vehicle.model)), '')
    ),
    v_vehicle.plate_number,
    v_rental.start_at,
    v_rental.expected_return_at,
    now()
  )
  returning id into v_agreement_id;

  return v_agreement_id;
end;
$$;

-- Only submit_rental_inspection (security definer) calls this.
revoke all on function private.record_rental_agreement(uuid, uuid, jsonb, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- submit_rental_inspection takes the agreement. Adding a parameter makes a
-- new overload, so the old signature is dropped first.
-- ---------------------------------------------------------------------------

drop function if exists public.submit_rental_inspection(
  uuid, public.inspection_type, numeric, numeric, public.inspection_cleanliness,
  public.inspection_odor, text, jsonb, jsonb, text, boolean, numeric, text,
  numeric, text, uuid
);

CREATE OR REPLACE FUNCTION public.submit_rental_inspection(p_rental_id uuid, p_inspection_type inspection_type, p_odometer numeric, p_fuel_level numeric, p_cleanliness inspection_cleanliness, p_odor inspection_odor, p_notes text, p_items jsonb, p_photos jsonb DEFAULT '[]'::jsonb, p_customer_signature_path text DEFAULT NULL::text, p_customer_acknowledged boolean DEFAULT false, p_fuel_charge_amount numeric DEFAULT NULL::numeric, p_fuel_charge_note text DEFAULT NULL::text, p_damage_charge_amount numeric DEFAULT NULL::numeric, p_damage_charge_note text DEFAULT NULL::text, p_template_id uuid DEFAULT NULL::uuid, p_agreement jsonb DEFAULT NULL::jsonb)
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

  -- The six fixed angles are gone: staff add any photos and videos they
  -- want, but the car still needs at least one on record.
  if not exists (
    select 1
    from jsonb_array_elements(p_photos) photo
    where coalesce(photo ->> 'kind', 'other') not in ('signature', 'damage_closeup')
      and nullif(trim(coalesce(photo ->> 'storage_path', '')), '') is not null
  ) then
    raise exception 'Add at least one photo or video of the car.'
      using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_photos) > 80 then
    raise exception 'An inspection can hold at most 80 photos and videos.'
      using errcode = 'check_violation';
  end if;

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

  -- Release signs the rental agreement in the same transaction, so a car is
  -- never released with half an agreement on record.
  if p_inspection_type = 'pickup' and p_agreement is not null then
    perform private.record_rental_agreement(
      p_rental_id,
      v_inspection_id,
      p_agreement,
      p_customer_signature_path
    );
  end if;

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

revoke all on function public.submit_rental_inspection(
  uuid, public.inspection_type, numeric, numeric, public.inspection_cleanliness,
  public.inspection_odor, text, jsonb, jsonb, text, boolean, numeric, text,
  numeric, text, uuid, jsonb
) from public, anon;
grant execute on function public.submit_rental_inspection(
  uuid, public.inspection_type, numeric, numeric, public.inspection_cleanliness,
  public.inspection_odor, text, jsonb, jsonb, text, boolean, numeric, text,
  numeric, text, uuid, jsonb
) to authenticated;
