-- Payment ledger for deposit / balance / penalty / refund audit history.
-- Rentals keep quote + payment_status as the invoice summary.

create type public.payment_type as enum (
  'deposit',
  'balance',
  'penalty',
  'refund',
  'adjustment'
);

create type public.payment_entry_status as enum (
  'submitted',
  'confirmed',
  'rejected',
  'cancelled'
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  rental_id uuid not null,
  payment_type public.payment_type not null,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'PHP' check (char_length(currency) between 3 and 3),
  method text check (
    method is null
    or method in ('gcash', 'maya', 'bank', 'cash', 'other')
  ),
  status public.payment_entry_status not null default 'submitted',
  external_reference text
    check (
      external_reference is null
      or char_length(trim(external_reference)) between 1 and 120
    ),
  proof_path text,
  notes text,
  submitted_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles (id) on delete set null,
  rejected_at timestamptz,
  rejected_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_organization_id_id_key unique (organization_id, id),
  constraint payments_rental_tenant_fkey
    foreign key (organization_id, rental_id)
    references public.rentals (organization_id, id) on delete cascade,
  constraint payments_confirmed_requires_timestamp check (
    status <> 'confirmed'
    or confirmed_at is not null
  ),
  constraint payments_rejected_requires_timestamp check (
    status <> 'rejected'
    or rejected_at is not null
  )
);

create index payments_organization_rental_idx
  on public.payments (organization_id, rental_id, created_at desc);

create index payments_rental_type_status_idx
  on public.payments (rental_id, payment_type, status);

create trigger payments_set_updated_at
before update on public.payments
for each row execute function private.set_updated_at();

comment on table public.payments is
  'Audit ledger of rental money events: deposit, balance, penalty, refund, adjustment.';

alter table public.payments enable row level security;
alter table public.payments force row level security;

revoke all on table public.payments from anon, authenticated;
grant select, insert, update, delete on table public.payments to authenticated;
grant all on table public.payments to service_role;

grant usage on type public.payment_type, public.payment_entry_status
  to authenticated, service_role;

create policy payments_select_org
on public.payments
for select
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) in ('owner', 'admin', 'staff')
);

create policy payments_insert_admin
on public.payments
for insert
to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) in ('owner', 'admin', 'staff')
);

create policy payments_update_admin
on public.payments
for update
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) in ('owner', 'admin', 'staff')
)
with check (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) in ('owner', 'admin', 'staff')
);

create policy payments_delete_admin
on public.payments
for delete
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) in ('owner', 'admin')
);

-- Backfill existing rental deposit proof rows into the ledger.
insert into public.payments (
  organization_id,
  rental_id,
  payment_type,
  amount,
  currency,
  method,
  status,
  external_reference,
  proof_path,
  notes,
  submitted_at,
  confirmed_at,
  confirmed_by
)
select
  r.organization_id,
  r.id,
  'deposit'::public.payment_type,
  greatest(coalesce(r.deposit_amount, 0), 0.01),
  'PHP',
  null,
  case
    when r.payment_status in ('deposit_paid', 'paid_in_full')
      then 'confirmed'::public.payment_entry_status
    when r.payment_status = 'proof_submitted'
      or r.payment_proof_path is not null
      then 'submitted'::public.payment_entry_status
    else 'submitted'::public.payment_entry_status
  end,
  nullif(btrim(coalesce(r.payment_reference, '')), ''),
  r.payment_proof_path,
  'Backfilled from rental deposit fields',
  coalesce(r.payment_proof_submitted_at, r.created_at),
  case
    when r.payment_status in ('deposit_paid', 'paid_in_full')
      then coalesce(r.deposit_confirmed_at, r.updated_at)
    else null
  end,
  r.deposit_confirmed_by
from public.rentals r
where r.payment_proof_path is not null
   or nullif(btrim(coalesce(r.payment_reference, '')), '') is not null
   or r.payment_status in ('proof_submitted', 'deposit_paid', 'paid_in_full');

create or replace function private.refresh_rental_payment_summary(p_rental_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rental public.rentals%rowtype;
  v_confirmed_credits numeric(12, 2);
  v_confirmed_penalties numeric(12, 2);
  v_has_submitted_deposit boolean;
  v_has_confirmed_deposit boolean;
  v_balance numeric(12, 2);
  v_status public.rental_payment_status;
begin
  select * into v_rental
  from public.rentals r
  where r.id = p_rental_id
  for update;

  if not found then
    return;
  end if;

  select
    coalesce(sum(case
      when p.payment_type in ('deposit', 'balance', 'adjustment')
        and p.status = 'confirmed'
      then p.amount
      when p.payment_type = 'refund' and p.status = 'confirmed'
      then -p.amount
      else 0
    end), 0),
    coalesce(sum(case
      when p.payment_type = 'penalty' and p.status = 'confirmed'
      then p.amount
      else 0
    end), 0),
    exists (
      select 1
      from public.payments p
      where p.rental_id = p_rental_id
        and p.payment_type = 'deposit'
        and p.status = 'submitted'
    ),
    exists (
      select 1
      from public.payments p
      where p.rental_id = p_rental_id
        and p.payment_type = 'deposit'
        and p.status = 'confirmed'
    )
  into
    v_confirmed_credits,
    v_confirmed_penalties,
    v_has_submitted_deposit,
    v_has_confirmed_deposit
  from public.payments p
  where p.rental_id = p_rental_id;

  v_balance := greatest(
    0,
    round(
      coalesce(v_rental.quoted_total, 0)
      + v_confirmed_penalties
      - v_confirmed_credits,
      2
    )
  );

  if v_balance <= 0 and v_confirmed_credits > 0 then
    v_status := 'paid_in_full';
  elsif v_has_confirmed_deposit then
    v_status := 'deposit_paid';
  elsif v_has_submitted_deposit then
    v_status := 'proof_submitted';
  else
    v_status := 'unpaid';
  end if;

  update public.rentals
  set
    balance_due = v_balance,
    payment_status = v_status,
    payment_reference = (
      select p.external_reference
      from public.payments p
      where p.rental_id = p_rental_id
        and p.payment_type = 'deposit'
      order by
        case p.status
          when 'submitted' then 0
          when 'confirmed' then 1
          else 2
        end,
        p.submitted_at desc
      limit 1
    ),
    payment_proof_path = (
      select p.proof_path
      from public.payments p
      where p.rental_id = p_rental_id
        and p.payment_type = 'deposit'
      order by
        case p.status
          when 'submitted' then 0
          when 'confirmed' then 1
          else 2
        end,
        p.submitted_at desc
      limit 1
    ),
    payment_proof_submitted_at = (
      select p.submitted_at
      from public.payments p
      where p.rental_id = p_rental_id
        and p.payment_type = 'deposit'
      order by
        case p.status
          when 'submitted' then 0
          when 'confirmed' then 1
          else 2
        end,
        p.submitted_at desc
      limit 1
    ),
    deposit_confirmed_at = case
      when v_has_confirmed_deposit then coalesce(deposit_confirmed_at, now())
      else deposit_confirmed_at
    end
  where id = p_rental_id;
end;
$$;

revoke all on function private.refresh_rental_payment_summary(uuid)
  from public, anon, authenticated;
grant execute on function private.refresh_rental_payment_summary(uuid)
  to service_role;

create or replace function public.get_booking_payment_details(
  p_rental_id uuid,
  p_reference_number text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ref text := btrim(coalesce(p_reference_number, ''));
  v_row record;
  v_deposit record;
begin
  if p_rental_id is null or char_length(v_ref) < 3 then
    raise exception 'Booking reference is required.' using errcode = '22023';
  end if;

  select
    r.id,
    r.organization_id,
    r.reference_number,
    r.status,
    r.start_at,
    r.expected_return_at,
    r.quoted_daily_rate,
    r.quoted_days,
    r.quoted_total,
    r.deposit_percent,
    r.deposit_amount,
    r.balance_due,
    r.payment_status,
    v.name as vehicle_name,
    v.make as vehicle_make,
    v.model as vehicle_model,
    o.payment_qr_url,
    o.payment_instructions,
    o.name as organization_name
  into v_row
  from public.rentals r
  inner join public.vehicles v
    on v.id = r.vehicle_id
   and v.organization_id = r.organization_id
  inner join public.organizations o on o.id = r.organization_id
  where r.id = p_rental_id
    and r.reference_number = v_ref
    and o.is_active
    and o.show_on_public_site;

  if not found then
    raise exception 'Booking not found. Check your reference number.'
      using errcode = 'P0002';
  end if;

  select
    p.id,
    p.external_reference,
    p.proof_path,
    p.submitted_at,
    p.status
  into v_deposit
  from public.payments p
  where p.rental_id = v_row.id
    and p.organization_id = v_row.organization_id
    and p.payment_type = 'deposit'
  order by
    case p.status
      when 'submitted' then 0
      when 'confirmed' then 1
      else 2
    end,
    p.submitted_at desc
  limit 1;

  return jsonb_build_object(
    'rental_id', v_row.id,
    'organization_id', v_row.organization_id,
    'reference_number', v_row.reference_number,
    'status', v_row.status,
    'start_at', v_row.start_at,
    'expected_return_at', v_row.expected_return_at,
    'quoted_daily_rate', v_row.quoted_daily_rate,
    'quoted_days', v_row.quoted_days,
    'quoted_total', v_row.quoted_total,
    'deposit_percent', v_row.deposit_percent,
    'deposit_amount', v_row.deposit_amount,
    'balance_due', v_row.balance_due,
    'payment_status', v_row.payment_status,
    'payment_reference', v_deposit.external_reference,
    'has_payment_proof', v_deposit.proof_path is not null,
    'payment_proof_submitted_at', v_deposit.submitted_at,
    'deposit_payment_id', v_deposit.id,
    'deposit_payment_status', v_deposit.status,
    'vehicle_name', v_row.vehicle_name,
    'vehicle_make', v_row.vehicle_make,
    'vehicle_model', v_row.vehicle_model,
    'payment_qr_url', v_row.payment_qr_url,
    'payment_instructions', v_row.payment_instructions,
    'organization_name', v_row.organization_name
  );
end;
$$;

create or replace function public.submit_booking_payment_proof(
  p_rental_id uuid,
  p_reference_number text,
  p_payment_reference text,
  p_proof_path text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref text := btrim(coalesce(p_reference_number, ''));
  v_pay_ref text := btrim(coalesce(p_payment_reference, ''));
  v_path text := btrim(coalesce(p_proof_path, ''));
  v_rental record;
  v_payment_id uuid;
begin
  if p_rental_id is null or char_length(v_ref) < 3 then
    raise exception 'Booking reference is required.' using errcode = '22023';
  end if;
  if char_length(v_pay_ref) not between 3 and 120 then
    raise exception 'Enter the GCash/Maya/bank reference number from your payment.'
      using errcode = '22023';
  end if;
  if char_length(v_path) < 8 or position('..' in v_path) > 0 then
    raise exception 'Payment screenshot is required.' using errcode = '22023';
  end if;

  select
    r.id,
    r.organization_id,
    r.status,
    r.payment_status,
    r.reference_number,
    r.deposit_amount,
    c.full_name as customer_name,
    c.phone_number as customer_phone,
    v.name as vehicle_name
  into v_rental
  from public.rentals r
  inner join public.customers c
    on c.id = r.customer_id
   and c.organization_id = r.organization_id
  inner join public.vehicles v
    on v.id = r.vehicle_id
   and v.organization_id = r.organization_id
  where r.id = p_rental_id
    and r.reference_number = v_ref
  for update of r;

  if not found then
    raise exception 'Booking not found. Check your reference number.'
      using errcode = 'P0002';
  end if;

  if v_rental.status <> 'draft' then
    raise exception 'This booking is already confirmed or closed.'
      using errcode = 'P0001';
  end if;

  if v_rental.payment_status in ('deposit_paid', 'paid_in_full') then
    raise exception 'Deposit for this booking was already confirmed.'
      using errcode = 'P0001';
  end if;

  if v_path not like (v_rental.organization_id::text || '/' || v_rental.id::text || '/%') then
    raise exception 'Invalid payment proof path.' using errcode = '22023';
  end if;

  -- Replace any previous unconfirmed deposit submission.
  update public.payments
  set
    status = 'cancelled',
    notes = coalesce(notes || E'\n', '') || 'Superseded by a newer proof upload',
    updated_at = now()
  where rental_id = v_rental.id
    and organization_id = v_rental.organization_id
    and payment_type = 'deposit'
    and status = 'submitted';

  insert into public.payments (
    organization_id,
    rental_id,
    payment_type,
    amount,
    currency,
    method,
    status,
    external_reference,
    proof_path,
    notes,
    submitted_at
  )
  values (
    v_rental.organization_id,
    v_rental.id,
    'deposit',
    greatest(coalesce(v_rental.deposit_amount, 0), 0.01),
    'PHP',
    null,
    'submitted',
    v_pay_ref,
    v_path,
    'Customer uploaded deposit proof',
    now()
  )
  returning id into v_payment_id;

  perform private.refresh_rental_payment_summary(v_rental.id);

  return jsonb_build_object(
    'success', true,
    'rental_id', v_rental.id,
    'payment_id', v_payment_id,
    'reference_number', v_rental.reference_number,
    'payment_status', 'proof_submitted',
    'deposit_amount', v_rental.deposit_amount,
    'customer_name', v_rental.customer_name,
    'customer_phone', v_rental.customer_phone,
    'vehicle_name', v_rental.vehicle_name,
    'payment_reference', v_pay_ref,
    'message', 'Payment proof received. We will confirm your reservation shortly.'
  );
end;
$$;

create or replace function public.confirm_rental_deposit(p_rental_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid := private.current_organization_id();
  v_role public.app_role := private.current_app_role();
  v_user_id uuid := auth.uid();
  v_rental record;
  v_payment_id uuid;
begin
  if v_user_id is null or v_organization_id is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  if v_role not in ('owner', 'admin', 'staff') then
    raise exception 'Staff access is required to confirm deposits.'
      using errcode = '42501';
  end if;
  if p_rental_id is null then
    raise exception 'Select a rental.' using errcode = '22023';
  end if;

  select
    r.id,
    r.status,
    r.payment_status,
    r.reference_number,
    r.deposit_amount
  into v_rental
  from public.rentals r
  where r.id = p_rental_id
    and r.organization_id = v_organization_id
  for update;

  if not found then
    raise exception 'Rental not found.' using errcode = 'P0002';
  end if;

  if v_rental.status not in ('draft', 'reserved') then
    raise exception 'Only draft or reserved rentals can confirm a deposit.'
      using errcode = 'P0001';
  end if;

  select p.id
  into v_payment_id
  from public.payments p
  where p.rental_id = v_rental.id
    and p.organization_id = v_organization_id
    and p.payment_type = 'deposit'
    and p.status = 'submitted'
  order by p.submitted_at desc
  limit 1
  for update;

  if v_payment_id is null then
    -- Allow confirming without a proof row only if staff explicitly confirms cash/offline.
    insert into public.payments (
      organization_id,
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
      v_organization_id,
      v_rental.id,
      'deposit',
      greatest(coalesce(v_rental.deposit_amount, 0), 0.01),
      'PHP',
      'cash',
      'confirmed',
      'Deposit confirmed by staff without customer proof upload',
      now(),
      now(),
      v_user_id
    )
    returning id into v_payment_id;
  else
    update public.payments
    set
      status = 'confirmed',
      confirmed_at = now(),
      confirmed_by = v_user_id
    where id = v_payment_id
      and organization_id = v_organization_id;
  end if;

  update public.rentals
  set
    deposit_confirmed_at = now(),
    deposit_confirmed_by = v_user_id
  where id = v_rental.id
    and organization_id = v_organization_id;

  perform private.refresh_rental_payment_summary(v_rental.id);

  if v_rental.status = 'draft' then
    perform private.transition_rental_impl(
      v_rental.id,
      'reserved'::public.rental_status,
      null,
      null,
      null,
      null
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'rental_id', v_rental.id,
    'payment_id', v_payment_id,
    'reference_number', v_rental.reference_number,
    'status', 'reserved',
    'payment_status', 'deposit_paid',
    'message', 'Deposit confirmed. Booking is now reserved.'
  );
end;
$$;

create or replace function public.record_rental_payment(
  p_rental_id uuid,
  p_payment_type public.payment_type,
  p_amount numeric,
  p_method text default 'cash',
  p_external_reference text default null,
  p_notes text default null,
  p_confirm boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid := private.current_organization_id();
  v_role public.app_role := private.current_app_role();
  v_user_id uuid := auth.uid();
  v_rental_id uuid;
  v_payment_id uuid;
  v_method text := nullif(lower(btrim(coalesce(p_method, ''))), '');
  v_ref text := nullif(btrim(coalesce(p_external_reference, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if v_user_id is null or v_organization_id is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  if v_role not in ('owner', 'admin', 'staff') then
    raise exception 'Staff access is required to record payments.'
      using errcode = '42501';
  end if;
  if p_rental_id is null then
    raise exception 'Select a rental.' using errcode = '22023';
  end if;
  if p_payment_type is null then
    raise exception 'Select a payment type.' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero.' using errcode = '22023';
  end if;
  if v_method is not null
    and v_method not in ('gcash', 'maya', 'bank', 'cash', 'other') then
    raise exception 'Invalid payment method.' using errcode = '22023';
  end if;

  select r.id into v_rental_id
  from public.rentals r
  where r.id = p_rental_id
    and r.organization_id = v_organization_id
  for update;

  if not found then
    raise exception 'Rental not found.' using errcode = 'P0002';
  end if;

  insert into public.payments (
    organization_id,
    rental_id,
    payment_type,
    amount,
    currency,
    method,
    status,
    external_reference,
    notes,
    submitted_at,
    confirmed_at,
    confirmed_by
  )
  values (
    v_organization_id,
    v_rental_id,
    p_payment_type,
    round(p_amount, 2),
    'PHP',
    v_method,
    case when p_confirm then 'confirmed' else 'submitted' end,
    v_ref,
    coalesce(v_notes, 'Recorded by staff'),
    now(),
    case when p_confirm then now() else null end,
    case when p_confirm then v_user_id else null end
  )
  returning id into v_payment_id;

  perform private.refresh_rental_payment_summary(v_rental_id);

  return jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'rental_id', v_rental_id,
    'message', 'Payment recorded.'
  );
end;
$$;

revoke all on function public.record_rental_payment(
  uuid, public.payment_type, numeric, text, text, text, boolean
) from public, anon, authenticated, service_role;
grant execute on function public.record_rental_payment(
  uuid, public.payment_type, numeric, text, text, text, boolean
) to authenticated;

comment on function public.record_rental_payment(
  uuid, public.payment_type, numeric, text, text, text, boolean
) is
  'Staff records a deposit, balance, penalty, refund, or adjustment against a rental.';

comment on function public.submit_booking_payment_proof(uuid, text, text, text) is
  'Customer deposit proof creates a submitted payments ledger row.';
comment on function public.confirm_rental_deposit(uuid) is
  'Confirms the latest submitted deposit payment and reserves the rental.';
