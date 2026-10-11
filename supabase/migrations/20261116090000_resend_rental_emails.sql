-- ===========================================================================
-- Owners can resend a customer email, to a corrected address if it was typed
-- wrong.
--
-- A resend is a new outbox row (resend_of points at the one it repeats), so
-- the failed or sent attempt stays on the timeline with its error and the
-- resend shows who asked for it. The original stops retrying so the customer
-- gets one copy. With p_update_customer the address is also saved on the
-- customer, so later emails go there too.
--
-- claim_rental_notification now sends to recipient_override when set, and a
-- resent reminder is not tied to the pickup time it was first queued for.
-- ===========================================================================

alter table public.rental_notifications
  add column recipient_override text
    check (
      recipient_override is null
      or (char_length(recipient_override) <= 254
          and recipient_override ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
    ),
  add column requested_by uuid references public.profiles (id) on delete set null,
  add column resend_of uuid references public.rental_notifications (id) on delete set null;

comment on column public.rental_notifications.recipient_override is
  'Where a resend goes when the owner corrected the address; null sends to the customer email.';
comment on column public.rental_notifications.requested_by is
  'The owner or admin who resent this email; null when the system queued it.';
comment on column public.rental_notifications.resend_of is
  'The email this row resends.';

-- ---------------------------------------------------------------------------
-- Claim: honor the corrected address.
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
        and ((v_note.resend_of is null
              and v_note.dedupe_key <> private.booking_reminder_key(v_rental.start_at))
             or v_rental.start_at <= now()) then
    v_skip := 'Pickup time changed or already passed.';
  end if;

  -- A resend goes where the owner typed it; otherwise the customer's email.
  v_recipient := coalesce(v_note.recipient_override, v_rental.customer_email);
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
    coalesce(nullif(cp.timezone, ''), 'Asia/Manila') as timezone,
    nullif(btrim(cp.review_thank_you_message), '') as thank_you_message,
    nullif(btrim(cp.review_google_url), '') as review_google_url,
    nullif(btrim(cp.review_facebook_url), '') as review_facebook_url,
    coalesce(
      nullif(btrim(cp.contact_facebook), ''),
      nullif(btrim(cp.contact_messenger), '')
    ) as facebook_page
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
      'timezone', coalesce(v_company.timezone, 'Asia/Manila'),
      'thankYouMessage', v_company.thank_you_message,
      'reviewGoogleUrl', v_company.review_google_url,
      'reviewFacebookUrl', v_company.review_facebook_url,
      'facebookPage', v_company.facebook_page
    )
  );
end;
$$;

revoke all on function public.claim_rental_notification(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_rental_notification(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Resend (owner/admin).
-- ---------------------------------------------------------------------------
create or replace function public.resend_rental_notification(
  p_notification_id uuid,
  p_recipient text,
  p_update_customer boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note public.rental_notifications%rowtype;
  v_typed text := btrim(coalesce(p_recipient, ''));
  v_recipient text := lower(btrim(coalesce(p_recipient, '')));
  v_rental record;
  v_id uuid;
begin
  if not (select private.is_org_admin()) then
    return jsonb_build_object(
      'success', false,
      'message', 'Only the owner or an admin can resend emails.'
    );
  end if;

  if char_length(v_recipient) > 254
     or v_recipient !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('success', false, 'message', 'Enter a valid email address.');
  end if;

  select * into v_note
  from public.rental_notifications
  where id = p_notification_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'message', 'That email no longer exists.');
  end if;

  -- One copy in flight at a time, counting earlier resends of the same email.
  if exists (
    select 1
    from public.rental_notifications n
    where n.rental_id = v_note.rental_id
      and n.kind = v_note.kind
      and (n.status = 'pending'
           or (n.status = 'sending' and n.last_attempt_at > now() - interval '10 minutes'))
      and n.created_at > now() - interval '10 minutes'
  ) then
    return jsonb_build_object(
      'success', false,
      'message', 'This email is already on its way. Check the timeline in a minute.'
    );
  end if;

  select r.status, r.start_at, r.customer_id
  into v_rental
  from public.rentals r
  where r.id = v_note.rental_id;

  -- The same checks the claim makes, so the owner hears why now.
  if v_note.kind in ('rental_released', 'rental_completed') then
    if not exists (
      select 1 from public.rental_inspections i
      where i.rental_id = v_note.rental_id
        and i.inspection_type = case
          when v_note.kind = 'rental_released' then 'pickup'
          else 'return'
        end::public.inspection_type
    ) then
      return jsonb_build_object(
        'success', false,
        'message', 'The inspection this email is about no longer exists.'
      );
    end if;
  elsif v_rental.status is distinct from 'reserved' then
    return jsonb_build_object(
      'success', false,
      'message', format(
        'This email is for reserved bookings, and this one is now %s.',
        coalesce(v_rental.status::text, 'gone')
      )
    );
  elsif v_note.kind = 'booking_reminder' and v_rental.start_at <= now() then
    return jsonb_build_object(
      'success', false,
      'message', 'The pickup time has passed, so there is nothing to remind.'
    );
  end if;

  -- Stop the original retrying so the customer gets one copy.
  update public.rental_notifications
  set
    status = case
      when status = 'sending' then 'failed'
      when status = 'pending' then 'skipped'
      else status
    end,
    last_error = case
      when status = 'sending' then coalesce(last_error, 'Stopped responding. Resent.')
      when status = 'pending' then 'Replaced by a resend.'
      else last_error
    end,
    attempts = 5
  where id = v_note.id
    and status in ('pending', 'sending', 'failed');

  if p_update_customer then
    update public.customers
    set email = v_typed
    where id = v_rental.customer_id
      and lower(btrim(coalesce(email, ''))) is distinct from v_recipient;
  end if;

  insert into public.rental_notifications (
    rental_id, kind, dedupe_key, recipient_override, requested_by, resend_of
  )
  values (
    v_note.rental_id,
    v_note.kind,
    'resend:' || gen_random_uuid()::text,
    v_recipient,
    auth.uid(),
    v_note.id
  )
  returning id into v_id;

  perform private.dispatch_rental_notification(v_id);

  return jsonb_build_object('success', true, 'id', v_id, 'recipient', v_recipient);
end;
$$;

revoke all on function public.resend_rental_notification(uuid, text, boolean)
  from public, anon;
grant execute on function public.resend_rental_notification(uuid, text, boolean)
  to authenticated;
