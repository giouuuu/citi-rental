-- The landing page's "Based in …" card shows the operating address to anonymous
-- visitors. company_profile stays closed to anon; this returns only that column.

create function public.get_public_operating_address()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(btrim(c.operating_address), '')
  from public.company_profile c
  limit 1;
$$;

revoke all on function public.get_public_operating_address()
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_operating_address()
  to anon, authenticated;
