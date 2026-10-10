-- ===========================================================================
-- The return email is a thank-you with the final bill, not a PDF.
--
-- rental_completed no longer attaches the return condition report. The claim
-- now returns the bill instead: rent (quoted_total), each confirmed charge
-- (fuel, damage, car wash, extension, adjustments, ...) and what was paid,
-- read from the payments ledger the same way the ops bill reads it.
--
-- rental_released carries only the signed agreement: its PDF no longer has
-- the pickup condition report.
-- ===========================================================================

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
  v_inspection_type public.inspection_type;
  v_bill jsonb;
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

  -- Release: the signed agreement, the only thing in its PDF.
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

    v_documents := jsonb_build_object(
      'agreement', v_agreement,
      'inspections', '[]'::jsonb
    );
  end if;

  -- Return: the final bill. Same lines and formula as the ops bill
  -- (buildRentalBill / private.refresh_rental_payment_summary): rent, each
  -- confirmed charge, and confirmed money in less refunds.
  if v_note.kind = 'rental_completed' then
    select jsonb_build_object(
      'rent', coalesce(v_rental.quoted_total, 0),
      'charges', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'label', coalesce(
              nullif(btrim(ct.name), ''),
              case when ct.code = 'bill_adjustment' then 'Bill adjustment' else 'Charge' end
            ),
            'amount', p.amount
          )
          order by p.submitted_at
        )
        from public.payments p
        left join public.rental_charge_types ct on ct.id = p.charge_type_id
        where p.rental_id = v_rental.id
          and p.payment_type = 'penalty'
          and p.status = 'confirmed'
      ), '[]'::jsonb),
      'paid', coalesce((
        select sum(case
          when p.payment_type in ('deposit', 'balance', 'adjustment') then p.amount
          when p.payment_type = 'refund' then -p.amount
          else 0
        end)
        from public.payments p
        where p.rental_id = v_rental.id
          and p.status = 'confirmed'
      ), 0)
    )
    into v_bill;
  end if;

  return jsonb_build_object(
    'claimed', true,
    'id', p_id,
    'kind', v_note.kind,
    'attempt', v_note.attempts + 1,
    'recipient', v_recipient,
    'plateNumber', v_rental.vehicle_plate,
    'documents', v_documents,
    'bill', v_bill,
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
