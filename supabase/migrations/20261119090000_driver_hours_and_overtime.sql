-- ===========================================================================
-- A driver's day covers set hours; past them the owner bills overtime.
--
-- The driver day rate (₱1,500) buys a 10-hour day. Each hour past that is
-- ₱250, which the owner settles with the renter at return, so it is never
-- priced into the booking. Customers see both on the bill.
--
-- 1. company_profile.driver_hours_per_day / driver_overtime_hourly_rate.
-- 2. get_public_driver_terms: rate, hours and overtime for the booking form.
--    get_public_driver_daily_rate stays for code deployed before this.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. The driver's hours on the company profile
-- ---------------------------------------------------------------------------
alter table public.company_profile
  add column driver_hours_per_day integer not null default 10
    check (driver_hours_per_day between 1 and 24),
  add column driver_overtime_hourly_rate numeric(12, 2)
    check (driver_overtime_hourly_rate is null or driver_overtime_hourly_rate >= 0);

comment on column public.company_profile.driver_hours_per_day is
  'Hours a day the driver day rate covers.';
comment on column public.company_profile.driver_overtime_hourly_rate is
  'Amount (PHP) per hour past driver_hours_per_day, settled at return. Null: not shown.';

grant select (driver_hours_per_day, driver_overtime_hourly_rate),
  update (driver_hours_per_day, driver_overtime_hourly_rate)
  on public.company_profile to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Public driver terms
-- ---------------------------------------------------------------------------
create function public.get_public_driver_terms()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'daily_rate', c.driver_daily_rate,
    'hours_per_day', c.driver_hours_per_day,
    'overtime_hourly_rate', c.driver_overtime_hourly_rate
  )
  from public.company_profile c
  limit 1;
$$;

revoke all on function public.get_public_driver_terms()
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_driver_terms()
  to anon, authenticated;
