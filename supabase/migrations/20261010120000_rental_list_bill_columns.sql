-- ---------------------------------------------------------------------------
-- The Rentals list shows each rental's bill: total, paid and balance.
--
-- These are PostgREST computed columns (functions taking a rentals row), so
-- `select=bill_total,amount_paid,bill_balance` and `order=bill_balance` work
-- like real columns. They read the payments ledger live with the same formula
-- as private.refresh_rental_payment_summary and buildRentalBill, instead of
-- trusting rentals.balance_due, which online bookings write as
-- "quote minus expected deposit" until a payment refreshes it.
--
-- Security invoker: payments RLS (private.is_org_staff) still applies, so
-- non-staff readers see nothing paid rather than someone else's ledger.
-- ---------------------------------------------------------------------------

create or replace function public.bill_total(public.rentals)
returns numeric
language sql
stable
set search_path = ''
as $$
  select round(
    coalesce($1.quoted_total, 0) + coalesce((
      select sum(p.amount)
      from public.payments p
      where p.rental_id = $1.id
        and p.payment_type = 'penalty'
        and p.status = 'confirmed'
    ), 0),
    2
  );
$$;

create or replace function public.amount_paid(public.rentals)
returns numeric
language sql
stable
set search_path = ''
as $$
  select round(coalesce(sum(
    case
      when p.payment_type in ('deposit', 'balance', 'adjustment') then p.amount
      when p.payment_type = 'refund' then -p.amount
      else 0
    end
  ), 0), 2)
  from public.payments p
  where p.rental_id = $1.id
    and p.status = 'confirmed';
$$;

create or replace function public.bill_balance(public.rentals)
returns numeric
language sql
stable
set search_path = ''
as $$
  select greatest(0, public.bill_total($1) - public.amount_paid($1));
$$;

comment on function public.bill_total(public.rentals) is
  'Rent quote plus confirmed charges. Computed column for the Rentals list.';
comment on function public.amount_paid(public.rentals) is
  'Confirmed money in less refunds. Computed column for the Rentals list.';
comment on function public.bill_balance(public.rentals) is
  'bill_total less amount_paid, never below zero. Computed column for the Rentals list.';

revoke all on function public.bill_total(public.rentals) from public, anon;
revoke all on function public.amount_paid(public.rentals) from public, anon;
revoke all on function public.bill_balance(public.rentals) from public, anon;
grant execute on function public.bill_total(public.rentals) to authenticated;
grant execute on function public.amount_paid(public.rentals) to authenticated;
grant execute on function public.bill_balance(public.rentals) to authenticated;
