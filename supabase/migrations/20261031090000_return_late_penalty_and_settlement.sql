-- ===========================================================================
-- Return sign-off: late-return penalty and settling the bill.
--
-- 1. A built-in `late_return` charge type, so a late penalty sits on the bill
--    under its own name. Staff can also add it by hand from the bill.
-- 2. complete_rental_return wraps submit_rental_inspection for returns and,
--    in the same transaction, posts the late-return penalty the owner set
--    (or nothing, when waived) and the payment taken at the counter. A car is
--    never marked returned with the penalty or the payment half-saved.
--    The payment cannot exceed the balance left after every charge.
-- ===========================================================================

insert into public.rental_charge_types (code, name, sort_order)
values ('late_return', 'Late return', 35)
on conflict (code) do nothing;

create or replace function public.complete_rental_return(
  p_rental_id uuid,
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
  p_template_id uuid default null,
  p_late_charge_amount numeric default null,
  p_late_charge_note text default null,
  p_payment_amount numeric default null,
  p_payment_method text default 'cash',
  p_payment_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_expected_return_at timestamptz;
  v_inspection_id uuid;
  v_late_payment_id uuid;
  v_payment_id uuid;
  v_balance numeric(12, 2);
  v_method text := nullif(lower(btrim(coalesce(p_payment_method, ''))), '');
begin
  if not (select private.is_org_staff()) then
    raise exception 'Staff access is required.' using errcode = 'insufficient_privilege';
  end if;
  if p_late_charge_amount is not null and p_late_charge_amount < 0 then
    raise exception 'The late-return penalty cannot be negative.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_late_charge_note, '')) > 500 then
    raise exception 'Keep the penalty note under 500 characters.' using errcode = '22023';
  end if;
  if p_payment_amount is not null and p_payment_amount <= 0 then
    raise exception 'The payment must be greater than zero.' using errcode = '22023';
  end if;
  if p_payment_amount is not null
    and (v_method is null or v_method not in ('gcash', 'maya', 'bank', 'cash', 'other')) then
    raise exception 'Choose how the renter paid.' using errcode = '22023';
  end if;

  select r.expected_return_at into v_expected_return_at
  from public.rentals r
  where r.id = p_rental_id;

  if p_late_charge_amount > 0 and v_expected_return_at >= now() then
    raise exception 'This car is not past its return date, so it has no late-return penalty.'
      using errcode = 'check_violation';
  end if;

  -- Locks the rental, checks it is active or overdue, completes it.
  v_inspection_id := public.submit_rental_inspection(
    p_rental_id => p_rental_id,
    p_inspection_type => 'return',
    p_odometer => p_odometer,
    p_fuel_level => p_fuel_level,
    p_cleanliness => p_cleanliness,
    p_odor => p_odor,
    p_notes => p_notes,
    p_items => p_items,
    p_photos => p_photos,
    p_customer_signature_path => p_customer_signature_path,
    p_customer_acknowledged => p_customer_acknowledged,
    p_fuel_charge_amount => p_fuel_charge_amount,
    p_fuel_charge_note => p_fuel_charge_note,
    p_damage_charge_amount => p_damage_charge_amount,
    p_damage_charge_note => p_damage_charge_note,
    p_template_id => p_template_id,
    p_agreement => null
  );

  if p_late_charge_amount > 0 then
    insert into public.payments (
      rental_id, payment_type, charge_type_id, amount, currency, method,
      status, notes, submitted_at, confirmed_at, confirmed_by
    )
    values (
      p_rental_id,
      'penalty',
      (select ct.id from public.rental_charge_types ct where ct.code = 'late_return'),
      round(p_late_charge_amount, 2),
      'PHP',
      'other',
      'confirmed',
      coalesce(nullif(btrim(coalesce(p_late_charge_note, '')), ''), 'Late return')
        || ' (inspection ' || v_inspection_id::text || ')',
      now(),
      now(),
      v_user_id
    )
    returning id into v_late_payment_id;
  end if;

  perform private.refresh_rental_payment_summary(p_rental_id);

  if p_payment_amount is not null then
    select r.balance_due into v_balance
    from public.rentals r
    where r.id = p_rental_id;

    if round(p_payment_amount, 2) > coalesce(v_balance, 0) then
      raise exception 'The payment (₱%) is more than the balance left (₱%).',
        to_char(round(p_payment_amount, 2), 'FM999,999,990.00'),
        to_char(coalesce(v_balance, 0), 'FM999,999,990.00')
        using errcode = 'check_violation';
    end if;

    insert into public.payments (
      rental_id, payment_type, amount, currency, method, status,
      external_reference, notes, submitted_at, confirmed_at, confirmed_by
    )
    values (
      p_rental_id,
      'balance',
      round(p_payment_amount, 2),
      'PHP',
      v_method,
      'confirmed',
      nullif(btrim(coalesce(p_payment_reference, '')), ''),
      'Settled at return inspection',
      now(),
      now(),
      v_user_id
    )
    returning id into v_payment_id;

    perform private.refresh_rental_payment_summary(p_rental_id);
  end if;

  perform private.write_audit_log(
    'rental.return_settled',
    'rental',
    p_rental_id,
    null,
    jsonb_build_object(
      'inspection_id', v_inspection_id,
      'late_payment_id', v_late_payment_id,
      'late_charge_amount', p_late_charge_amount,
      'payment_id', v_payment_id,
      'payment_amount', p_payment_amount
    ),
    '{}'::jsonb
  );

  return v_inspection_id;
end;
$$;

revoke all on function public.complete_rental_return(
  uuid, numeric, numeric, public.inspection_cleanliness, public.inspection_odor,
  text, jsonb, jsonb, text, boolean, numeric, text, numeric, text, uuid,
  numeric, text, numeric, text, text
) from public, anon;
grant execute on function public.complete_rental_return(
  uuid, numeric, numeric, public.inspection_cleanliness, public.inspection_odor,
  text, jsonb, jsonb, text, boolean, numeric, text, numeric, text, uuid,
  numeric, text, numeric, text, text
) to authenticated;

comment on function public.complete_rental_return is
  'Return inspection plus the late-return penalty and the payment taken at the counter, in one transaction.';
