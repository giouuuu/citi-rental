-- Migration 20261008110000: PayMongo Checkout for the booking deposit.
-- service_role-only RPCs; a paid webhook records a submitted 'paymongo'
-- deposit once per event, for staff to confirm.
begin;
set local search_path = public, extensions;
select plan(14);

create temp table _res (k text primary key, res jsonb) on commit drop;
grant all on _res to public;

insert into storage.objects (bucket_id, name)
select 'booking-ids', '00000000-0000-4000-8000-000000000e01/' || kind || '.jpg'
from unnest(array['license-selfie', 'government-id']) kind;

-- A fresh draft booking to pay for.
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
insert into _res (k, res)
select 'bk', public.create_public_booking(
  'c0000000-0000-4000-8000-000000000003',
  now() + interval '140 days', now() + interval '141 days',
  'Paula Payer', '09175556666', 'paula@example.com', 'L-PAULA',
  'Airport', 'Airport', null, 'Mabolo, Cebu City', 'fb.com/paula',
  'Moalboal', 2,
  '00000000-0000-4000-8000-000000000e01/license-selfie.jpg',
  '00000000-0000-4000-8000-000000000e01/government-id.jpg'
);
reset role;

create temp table _bk on commit drop as
select (res ->> 'rental_id')::uuid as rental_id,
       res ->> 'reference_number' as reference_number,
       (res ->> 'deposit_amount')::numeric as deposit
from _res where k = 'bk';
grant select on _bk to public;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.record_paymongo_checkout(uuid, text, text, numeric, boolean)', 'execute'),
  'anon cannot record a checkout'
);
select ok(
  not has_function_privilege('authenticated', 'public.apply_paymongo_checkout_paid(text, text, text, bigint, boolean)', 'execute'),
  'signed-in users cannot apply a paid webhook'
);
select ok(
  has_function_privilege('service_role', 'public.apply_paymongo_checkout_paid(text, text, text, bigint, boolean)', 'execute'),
  'service_role can apply a paid webhook'
);

-- ---------------------------------------------------------------------------
-- Recording a checkout
-- ---------------------------------------------------------------------------
set local role service_role;
select throws_ok(
  $$ select public.record_paymongo_checkout(
       (select rental_id from _bk), (select reference_number from _bk),
       'cs_wrongamount', 1, false) $$,
  '22023', 'Checkout amount does not match the booking deposit.',
  'the checkout amount must equal the deposit'
);
select throws_ok(
  $$ select public.record_paymongo_checkout(
       (select rental_id from _bk), 'WEB-NOPE',
       'cs_wrongref', (select deposit from _bk), false) $$,
  'P0002', 'Booking not found. Check your reference number.',
  'the reference number must match'
);
select lives_ok(
  $$ select public.record_paymongo_checkout(
       (select rental_id from _bk), (select reference_number from _bk),
       'cs_first', (select deposit from _bk), false) $$,
  'a draft booking records a checkout'
);
select lives_ok(
  $$ select public.record_paymongo_checkout(
       (select rental_id from _bk), (select reference_number from _bk),
       'cs_second', (select deposit from _bk), false) $$,
  'a second checkout can be started'
);
reset role;
select is(
  (select status from public.paymongo_checkouts where checkout_session_id = 'cs_first'),
  'expired',
  'the newer checkout expires the older pending one'
);

-- ---------------------------------------------------------------------------
-- Applying the paid webhook
-- ---------------------------------------------------------------------------
set local role service_role;
select is(
  public.apply_paymongo_checkout_paid('evt_short', 'cs_second', 'pay_short', 100, false) ->> 'result',
  'amount_mismatch',
  'an underpaid checkout is not recorded'
);
select is(
  public.apply_paymongo_checkout_paid('evt_mode', 'cs_second', 'pay_mode',
    (select (deposit * 100)::bigint from _bk), true) ->> 'result',
  'mode_mismatch',
  'a live-mode event cannot pay a test-mode checkout'
);
select is(
  public.apply_paymongo_checkout_paid('evt_paid', 'cs_second', 'pay_123',
    (select (deposit * 100)::bigint from _bk), false) ->> 'result',
  'recorded',
  'a paid webhook is recorded'
);
select is(
  public.apply_paymongo_checkout_paid('evt_paid', 'cs_second', 'pay_123',
    (select (deposit * 100)::bigint from _bk), false) ->> 'result',
  'duplicate',
  'the same event replayed is acknowledged, not re-applied'
);
reset role;

select is(
  (select count(*) || '|' || min(method) || '|' || min(status::text) || '|' || min(external_reference)
     from public.payments
    where rental_id = (select rental_id from _bk) and status <> 'cancelled'),
  '1|paymongo|submitted|pay_123',
  'one submitted paymongo deposit awaits staff confirmation'
);
select is(
  (select payment_status::text || '|' || status::text from public.rentals
    where id = (select rental_id from _bk)),
  'proof_submitted|draft',
  'the booking shows payment received and stays draft until staff confirm'
);

select * from finish(true);
rollback;
