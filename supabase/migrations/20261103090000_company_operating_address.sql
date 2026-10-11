-- Operating address: where the business currently runs day to day (garage,
-- office, pickup point). Separate from business_address, the registered
-- address printed on the rental agreement, because the two can differ.

alter table public.company_profile
  add column if not exists operating_address text
    check (operating_address is null or char_length(operating_address) <= 300);

comment on column public.company_profile.operating_address is
  'Where the business currently operates (office, garage, pickup point). Not the registered business_address on the agreement.';

grant select (operating_address) on public.company_profile to authenticated;
grant update (operating_address) on public.company_profile to authenticated;
