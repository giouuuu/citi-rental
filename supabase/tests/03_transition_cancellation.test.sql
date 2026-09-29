-- Migration 20260929102000: transition_rental(..., p_cancellation_reason),
-- cancelled_at stamping, and backwards compatibility of the 6-arg impl call
-- used by confirm_rental_deposit.
begin;
set local search_path = public, extensions;
select plan(17);

select has_function(
  'public', 'transition_rental',
  array['uuid', 'rental_status', 'timestamp with time zone', 'numeric', 'numeric', 'text', 'text'],
  'transition_rental has the 7-arg signature'
);
select hasnt_function(
  'public', 'transition_rental',
  array['uuid', 'rental_status', 'timestamp with time zone', 'numeric', 'numeric', 'text'],
  'old 6-arg transition_rental overload is gone (no ambiguity for PostgREST)'
);
select ok(
  not has_function_privilege('anon', 'public.transition_rental(uuid, public.rental_status, timestamptz, numeric, numeric, text, text)', 'execute'),
  'anon cannot execute transition_rental'
);

-- ---------------------------------------------------------------------------
-- As staff
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000003","role":"authenticated","email":"staff@zeke.test"}';

select throws_ok(
  $$ select public.transition_rental(
       p_rental_id => 'e0000000-0000-4000-8000-000000000005',
       p_status => 'cancelled',
       p_actual_return_at => null,
       p_ending_odometer => null,
       p_ending_fuel_level => null,
       p_notes => null,
       p_cancellation_reason => 'bogus') $$,
  '22023',
  null,
  'invalid cancellation reason is rejected'
);
select is(
  (select status::text from public.rentals where id = 'e0000000-0000-4000-8000-000000000005'),
  'reserved',
  'rejected call left the rental untouched'
);

select is(
  public.transition_rental(
    p_rental_id => 'e0000000-0000-4000-8000-000000000005',
    p_status => 'cancelled',
    p_actual_return_at => null,
    p_ending_odometer => null,
    p_ending_fuel_level => null,
    p_notes => null,
    p_cancellation_reason => 'no_show'),
  'e0000000-0000-4000-8000-000000000005'::uuid,
  'staff cancels with a reason using the app''s named-arg call'
);
select is(
  (select status::text || '|' || cancellation_reason from public.rentals
    where id = 'e0000000-0000-4000-8000-000000000005'),
  'cancelled|no_show',
  'status and cancellation_reason stored'
);
select is(
  (select cancelled_at from public.rentals where id = 'e0000000-0000-4000-8000-000000000005'),
  now(),
  'cancelled_at stamped with now()'
);

reset role;
select is(
  (select new_data ->> 'cancellation_reason' from public.audit_logs
    where resource_id = 'e0000000-0000-4000-8000-000000000005'
      and action = 'rental.transitioned'
    order by created_at desc limit 1),
  'no_show',
  'audit log payload includes the cancellation reason'
);

-- confirm_rental_deposit still calls the impl with 6 positional args.
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000003","role":"authenticated","email":"staff@zeke.test"}';
select is(
  public.confirm_rental_deposit('e0000000-0000-4000-8000-000000000007') ->> 'status',
  'reserved',
  'confirm_rental_deposit (6-arg impl call) still transitions draft -> reserved'
);
select is(
  (select status::text from public.rentals where id = 'e0000000-0000-4000-8000-000000000007'),
  'reserved',
  'deposit-confirmed rental is reserved'
);

-- Cancel without a reason (reason is optional).
select lives_ok(
  $$ select public.transition_rental(
       p_rental_id => 'e0000000-0000-4000-8000-000000000007',
       p_status => 'cancelled') $$,
  'cancel without a reason works'
);
select is(
  (select (cancelled_at is not null) and cancellation_reason is null
     from public.rentals where id = 'e0000000-0000-4000-8000-000000000007'),
  true,
  'reason-less cancel: cancelled_at set, reason null'
);

-- Direct table write (ops PostgREST path) is stamped by the trigger too.
update public.rentals set status = 'cancelled'
where id = 'e0000000-0000-4000-8000-000000000003';
select isnt(
  (select cancelled_at from public.rentals where id = 'e0000000-0000-4000-8000-000000000003'),
  null,
  'trigger stamps cancelled_at on a direct status update'
);

-- ---------------------------------------------------------------------------
-- As customer
-- ---------------------------------------------------------------------------
set local request.jwt.claims =
  '{"sub":"0000000a-0000-4000-8000-000000000004","role":"authenticated","email":"alice@example.com"}';
select throws_ok(
  $$ select public.transition_rental(
       p_rental_id => 'e0000000-0000-4000-8000-000000000002',
       p_status => 'cancelled',
       p_cancellation_reason => 'customer_request') $$,
  '42501',
  null,
  'customers cannot transition rentals'
);

reset role;
select throws_ok(
  $$ update public.rentals set cancellation_reason = 'whatever'
     where id = 'e0000000-0000-4000-8000-000000000004' $$,
  '23514',
  null,
  'cancellation_reason is constrained at the table level'
);
update public.rentals set notes = 'follow-up call done'
where id = 'e0000000-0000-4000-8000-000000000004';
select is(
  (select cancelled_at from public.rentals where id = 'e0000000-0000-4000-8000-000000000004'),
  '2026-03-06 10:00+08'::timestamptz,
  'pre-existing cancelled_at is not rewritten by unrelated updates'
);

select * from finish(true);
rollback;
