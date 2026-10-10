-- Customer emails at release and at return, each with a PDF attached.
--
--   rental_released   the pickup inspection was submitted (car handed over):
--                     the signed rental agreement + pickup condition report
--   rental_completed  the return inspection was submitted: the condition
--                     report comparing pickup and return, with the charges
--
-- Same outbox as the booking emails (rental_notifications): a trigger on
-- rental_inspections queues the row and pings send-booking-email through
-- pg_net after commit, so the agreement and photos written in the same
-- transaction are there when the function claims it. claim_rental_notification
-- now also returns the agreement and inspections the PDF is built from.

alter table public.rental_notifications
  drop constraint if exists rental_notifications_kind_check;
alter table public.rental_notifications
  add constraint rental_notifications_kind_check check (
    kind in (
      'booking_confirmed',
      'deposit_confirmed',
      'booking_reminder',
      'rental_released',
      'rental_completed'
    )
  );

-- ---------------------------------------------------------------------------
-- Trigger: queue the release and return emails.
-- ---------------------------------------------------------------------------
create or replace function private.queue_inspection_emails()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enqueue_rental_notification(
    new.rental_id,
    case
      when new.inspection_type = 'pickup' then 'rental_released'
      else 'rental_completed'
    end
  );
  return null;
end;
$$;

revoke all on function private.queue_inspection_emails()
  from public, anon, authenticated;

drop trigger if exists rental_inspections_queue_emails on public.rental_inspections;
create trigger rental_inspections_queue_emails
after insert on public.rental_inspections
for each row execute function private.queue_inspection_emails();

-- ---------------------------------------------------------------------------
-- Claim: booking emails as before; release/return emails also carry the
-- documents for the PDF.
-- ---------------------------------------------------------------------------
create or replace function public.claim_rental_notification(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note public.rental_notifications%rowtype;
  v_rental record;
  v_company record;
  v_recipient text;
  v_skip text;
  v_deposit_paid numeric;
  v_documents jsonb;
  v_agreement jsonb;
  v_inspections jsonb;
  v_inspection_type public.inspection_type;
begin
  select * into v_note
  from public.rental_notifications
  where id = p_id
  for update;

  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'not_found');
  end if;

  -- A second ping for a row already in flight (or done) is a no-op; a send
  -- stuck for 10 minutes is assumed dead and may be retried.
  if v_note.attempts >= 5
     or v_note.status in ('sent', 'skipped')
     or (v_note.status = 'sending'
         and v_note.last_attempt_at > now() - interval '10 minutes') then
    return jsonb_build_object('claimed', false, 'reason', v_note.status);
  end if;

  select
    r.id,
    r.reference_number,
    r.status,
    r.payment_status,
    r.start_at,
    r.expected_return_at,
    r.pickup_location,
    r.return_location,
    r.destination,
    r.with_driver,
    r.quoted_total,
    r.balance_due,
    r.booking_source,
    r.created_by,
    c.full_name as customer_name,
    nullif(lower(btrim(c.email)), '') as customer_email,
    coalesce(
      nullif(btrim(v.name), ''),
      nullif(concat_ws(' ', v.make, v.model), '')
    ) as vehicle_name,
    v.year as vehicle_year,
    v.transmission::text as vehicle_transmission,
    v.seating_capacity as vehicle_seats,
    v.plate_number as vehicle_plate
  into v_rental
  from public.rentals r
  join public.customers c on c.id = r.customer_id
  join public.vehicles v on v.id = r.vehicle_id
  where r.id = v_note.rental_id;

  if v_note.kind in ('rental_released', 'rental_completed') then
    v_inspection_type := case
      when v_note.kind = 'rental_released' then 'pickup'
      else 'return'
    end::public.inspection_type;
    if not exists (
      select 1 from public.rental_inspections i
      where i.rental_id = v_note.rental_id
        and i.inspection_type = v_inspection_type
    ) then
      v_skip := 'The inspection for this email no longer exists.';
    end if;
  elsif v_rental.status is distinct from 'reserved' then
    v_skip := 'Booking is no longer reserved.';
  elsif v_note.kind = 'booking_reminder'
        and (v_note.dedupe_key <> private.booking_reminder_key(v_rental.start_at)
             or v_rental.start_at <= now()) then
    v_skip := 'Pickup time changed or already passed.';
  end if;

  v_recipient := v_rental.customer_email;
  if v_recipient is null and v_rental.booking_source = 'public_web' then
    select nullif(lower(btrim(u.email)), '') into v_recipient
    from auth.users u
    where u.id = v_rental.created_by;
  end if;
  if v_skip is null and v_recipient is null then
    v_skip := 'No email address on file for this customer.';
  end if;

  if v_skip is not null then
    update public.rental_notifications
    set status = 'skipped', last_error = v_skip, recipient = v_recipient
    where id = p_id;
    return jsonb_build_object('claimed', false, 'reason', 'skipped');
  end if;

  update public.rental_notifications
  set
    status = 'sending',
    attempts = attempts + 1,
    last_attempt_at = now(),
    recipient = v_recipient
  where id = p_id;

  select coalesce(sum(p.amount), 0) into v_deposit_paid
  from public.payments p
  where p.rental_id = v_rental.id
    and p.payment_type = 'deposit'
    and p.status = 'confirmed';

  select
    cp.legal_name,
    cp.contact_phone,
    cp.contact_email,
    cp.business_address,
    coalesce(nullif(cp.timezone, ''), 'Asia/Manila') as timezone
  into v_company
  from public.company_profile cp
  limit 1;

  if v_inspection_type is not null then
    -- The agreement only goes out with the release email.
    if v_note.kind = 'rental_released' then
      select jsonb_build_object(
        'terms', a.terms,
        'companyName', a.company_name,
        'companyAddress', a.company_address,
        'companyPhone', a.company_phone,
        'companyEmail', a.company_email,
        'companySignaturePath', a.company_signature_path,
        'renterName', a.renter_name,
        'renterLicenseNumber', a.renter_license_number,
        'renterAddress', a.renter_address,
        'renterSignaturePath', a.renter_signature_path,
        'rentalReference', a.rental_reference,
        'vehicleLabel', a.vehicle_label,
        'plateNumber', a.plate_number,
        'startAt', a.start_at,
        'expectedReturnAt', a.expected_return_at,
        'signedAt', a.signed_at
      )
      into v_agreement
      from public.rental_agreements a
      where a.rental_id = v_rental.id;
    end if;

    -- Release: the pickup report. Return: pickup and return, to compare.
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'type', i.inspection_type,
          'inspectedAt', i.inspected_at,
          'odometer', i.odometer,
          'fuelLevel', i.fuel_level,
          'cleanliness', i.cleanliness,
          'odor', i.odor,
          'notes', i.notes,
          'fuelChargeAmount', i.fuel_charge_amount,
          'fuelChargeNote', i.fuel_charge_note,
          'damageChargeAmount', i.damage_charge_amount,
          'damageChargeNote', i.damage_charge_note,
          'customerSignaturePath', i.customer_signature_path,
          'customerAcknowledgedAt', i.customer_acknowledged_at,
          'mediaCount', (
            select count(*)
            from public.rental_inspection_photos p
            where p.inspection_id = i.id
              and p.kind <> 'signature'
          ),
          'items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'areaCode', it.area_code,
                'label', it.label,
                'status', it.status,
                'severity', it.severity,
                'notes', it.notes
              )
              order by coalesce(ti.sort_order, 2147483647), it.label
            )
            from public.rental_inspection_items it
            left join public.inspection_checklist_template_items ti
              on ti.template_id = i.template_id
             and ti.area_code = it.area_code
            where it.inspection_id = i.id
          ), '[]'::jsonb)
        )
        order by i.inspected_at
      ),
      '[]'::jsonb
    )
    into v_inspections
    from public.rental_inspections i
    where i.rental_id = v_rental.id
      and (v_note.kind = 'rental_completed' or i.inspection_type = 'pickup');

    v_documents := jsonb_build_object(
      'agreement', v_agreement,
      'inspections', v_inspections
    );
  end if;

  return jsonb_build_object(
    'claimed', true,
    'id', p_id,
    'kind', v_note.kind,
    'attempt', v_note.attempts + 1,
    'recipient', v_recipient,
    'plateNumber', v_rental.vehicle_plate,
    'documents', v_documents,
    'booking', jsonb_build_object(
      'id', v_rental.id,
      'referenceNumber', v_rental.reference_number,
      'customerName', v_rental.customer_name,
      'vehicleName', v_rental.vehicle_name,
      'vehicleYear', v_rental.vehicle_year,
      'vehicleTransmission', v_rental.vehicle_transmission,
      'vehicleSeats', v_rental.vehicle_seats,
      'startAt', v_rental.start_at,
      'returnAt', v_rental.expected_return_at,
      'pickupLocation', v_rental.pickup_location,
      'returnLocation', v_rental.return_location,
      'destination', v_rental.destination,
      'withDriver', coalesce(v_rental.with_driver, false),
      'total', v_rental.quoted_total,
      'depositPaid', v_deposit_paid,
      'balanceDue', v_rental.balance_due
    ),
    'company', jsonb_build_object(
      'name', v_company.legal_name,
      'phone', v_company.contact_phone,
      'email', v_company.contact_email,
      'address', v_company.business_address,
      'timezone', coalesce(v_company.timezone, 'Asia/Manila')
    )
  );
end;
$$;

revoke all on function public.claim_rental_notification(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_rental_notification(uuid) to service_role;
