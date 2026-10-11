-- The rental agreement wording becomes editable in Settings.
--
-- company_profile.agreement_template holds the owner's version of the
-- agreement (title, clauses, sections, acknowledgement, cancellation policy);
-- null means the built-in template from the app. agreement_template_version
-- changes on every save and is recorded on bookings (rentals.terms_version)
-- and signed agreements (rental_agreements.template_version). Signed
-- agreements already freeze their terms, so edits only reach agreements
-- signed afterwards.

alter table public.company_profile
  add column if not exists agreement_template jsonb
    check (agreement_template is null or jsonb_typeof(agreement_template) = 'object'),
  add column if not exists agreement_template_version text
    check (
      agreement_template_version is null
      or char_length(agreement_template_version) between 1 and 40
    );

comment on column public.company_profile.agreement_template is
  'Rental agreement wording edited in Settings; null uses the built-in template.';
comment on column public.company_profile.agreement_template_version is
  'Version label of agreement_template, renewed on every save.';

grant select (agreement_template, agreement_template_version)
  on public.company_profile to authenticated;
grant update (agreement_template, agreement_template_version)
  on public.company_profile to authenticated;

-- The booking form shows the terms to anonymous visitors. company_profile
-- stays closed to anon; this returns only the template and its version.
create function public.get_public_agreement_template()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'template', c.agreement_template,
    'version', c.agreement_template_version
  )
  from public.company_profile c
  limit 1;
$$;

revoke all on function public.get_public_agreement_template()
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_agreement_template()
  to anon, authenticated;
