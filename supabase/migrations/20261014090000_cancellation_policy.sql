-- ===========================================================================
-- Cancellation policy: a free-cancellation window and a specific "Other"
-- reason.
--
-- 1. company_profile.free_cancellation_hours (default 24) is set in Settings.
--    Cancelling a rental fewer hours than this before pickup keeps the paid
--    reservation fee.
-- 2. rentals.cancellation_note holds the specific reason. Required when the
--    reason is 'other'.
-- 3. rentals.reservation_fee_forfeited is decided once, when the rental is
--    cancelled, so later changes to the window do not rewrite history.
--    Null when nothing was paid.
-- 4. transition_rental gains a trailing p_cancellation_note.
-- 5. get_public_free_cancellation_hours lets the booking page state the
--    policy.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. The window on the company profile
-- ---------------------------------------------------------------------------
alter table public.company_profile
  add column free_cancellation_hours integer not null default 24
    check (free_cancellation_hours between 0 and 720);

comment on column public.company_profile.free_cancellation_hours is
  'Hours before pickup a booking can be cancelled with the reservation fee refunded. Later cancellations keep the fee.';

grant select (free_cancellation_hours), update (free_cancellation_hours)
  on public.company_profile to authenticated;

-- ---------------------------------------------------------------------------
-- 2 + 3. What the cancellation recorded
-- ---------------------------------------------------------------------------
alter table public.rentals
  add column cancellation_note text
    check (
      cancellation_note is null
      or char_length(btrim(cancellation_note)) between 1 and 500
    ),
  add column reservation_fee_forfeited boolean;

comment on column public.rentals.cancellation_note is
  'Specific cancellation reason typed by staff; required when cancellation_reason is other.';
comment on column public.rentals.reservation_fee_forfeited is
  'Set on cancellation when a deposit was paid: true when cancelled inside the free-cancellation window (fee kept), false when refundable.';

-- ---------------------------------------------------------------------------
-- 4. transition_rental(+ p_cancellation_note)
-- ---------------------------------------------------------------------------
drop function public.transition_rental(
  uuid, public.rental_status, timestamptz, numeric, numeric, text, text
);
drop function private.transition_rental_impl(
  uuid, public.rental_status, timestamptz, numeric, numeric, text, text
);

create function private.transition_rental_impl(
  p_rental_id uuid,
  p_status public.rental_status,
  p_actual_return_at timestamptz,
  p_ending_odometer numeric,
  p_ending_fuel_level numeric,
  p_notes text,
  p_cancellation_reason text default null,
  p_cancellation_note text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_reason text := nullif(lower(btrim(coalesce(p_cancellation_reason, ''))), '');
  v_note text := nullif(btrim(coalesce(p_cancellation_note, '')), '');
  v_start_at timestamptz;
  v_free_hours integer;
  v_deposit_paid numeric(12, 2) := 0;
  v_forfeited boolean;
  v_new_data jsonb;
begin
  if not (select private.is_org_staff()) then
    raise exception 'Staff access is required.' using errcode = 'insufficient_privilege';
  end if;

  if v_reason is not null and v_reason not in (
    'customer_request', 'no_show', 'payment_not_received',
    'vehicle_unavailable', 'duplicate', 'other'
  ) then
    raise exception 'Invalid cancellation reason: %.', p_cancellation_reason
      using errcode = '22023';
  end if;

  if p_status = 'cancelled' and v_reason = 'other' and v_note is null then
    raise exception 'Describe the reason for cancelling.' using errcode = '22023';
  end if;

  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'Keep the cancellation reason under 500 characters.'
      using errcode = '22023';
  end if;

  select r.start_at into v_start_at
  from public.rentals r
  where r.id = p_rental_id
  for update;
  if not found then
    raise exception 'Rental was not found.' using errcode = 'no_data_found';
  end if;

  if p_status = 'active'
    and not exists (
      select 1 from public.rental_inspections i
      where i.rental_id = p_rental_id
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
        and i.inspection_type = 'return'
    ) then
    raise exception
      'Complete a return inspection before completing this rental.'
      using errcode = 'check_violation';
  end if;

  if p_status = 'cancelled' then
    select coalesce(sum(p.amount), 0) into v_deposit_paid
    from public.payments p
    where p.rental_id = p_rental_id
      and p.payment_type = 'deposit'
      and p.status = 'confirmed';

    if v_deposit_paid > 0 then
      select c.free_cancellation_hours into v_free_hours
      from public.company_profile c
      limit 1;
      v_forfeited :=
        now() > v_start_at - make_interval(hours => coalesce(v_free_hours, 24));
    end if;
  end if;

  update public.rentals
  set status = p_status,
      actual_return_at = case
        when p_status = 'completed' then coalesce(p_actual_return_at, now())
        else actual_return_at
      end,
      ending_odometer = coalesce(p_ending_odometer, ending_odometer),
      ending_fuel_level = coalesce(p_ending_fuel_level, ending_fuel_level),
      notes = coalesce(p_notes, notes),
      cancellation_reason = case
        when p_status = 'cancelled' then v_reason
        else cancellation_reason
      end,
      cancellation_note = case
        when p_status = 'cancelled' then v_note
        else cancellation_note
      end,
      reservation_fee_forfeited = case
        when p_status = 'cancelled' then v_forfeited
        else reservation_fee_forfeited
      end
  where id = p_rental_id;

  v_new_data := jsonb_build_object('status', p_status);
  if p_status = 'cancelled' then
    v_new_data := v_new_data || jsonb_build_object(
      'cancellation_reason', v_reason,
      'cancellation_note', v_note,
      'deposit_paid', v_deposit_paid,
      'reservation_fee_forfeited', v_forfeited
    );
  end if;

  perform private.write_audit_log(
    'rental.transitioned',
    'rental',
    p_rental_id,
    null,
    v_new_data,
    '{}'::jsonb
  );
  return p_rental_id;
end;
$function$;

create function public.transition_rental(
  p_rental_id uuid,
  p_status public.rental_status,
  p_actual_return_at timestamptz default null,
  p_ending_odometer numeric default null,
  p_ending_fuel_level numeric default null,
  p_notes text default null,
  p_cancellation_reason text default null,
  p_cancellation_note text default null
)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.transition_rental_impl(
    p_rental_id, p_status, p_actual_return_at, p_ending_odometer,
    p_ending_fuel_level, p_notes, p_cancellation_reason, p_cancellation_note
  )
$$;

revoke execute on function private.transition_rental_impl(
  uuid, public.rental_status, timestamptz, numeric, numeric, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function private.transition_rental_impl(
  uuid, public.rental_status, timestamptz, numeric, numeric, text, text, text
) to authenticated;

revoke execute on function public.transition_rental(
  uuid, public.rental_status, timestamptz, numeric, numeric, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.transition_rental(
  uuid, public.rental_status, timestamptz, numeric, numeric, text, text, text
) to authenticated;

comment on function public.transition_rental(
  uuid, public.rental_status, timestamptz, numeric, numeric, text, text, text
) is
  'Staff rental status transition with inspection gates. Cancelling stores the reason, the specific note (required for other), and whether the paid reservation fee is kept.';

-- ---------------------------------------------------------------------------
-- 5. The window for the public booking page
-- ---------------------------------------------------------------------------
create function public.get_public_free_cancellation_hours()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select c.free_cancellation_hours from public.company_profile c limit 1;
$$;

revoke all on function public.get_public_free_cancellation_hours()
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_free_cancellation_hours()
  to anon, authenticated;
