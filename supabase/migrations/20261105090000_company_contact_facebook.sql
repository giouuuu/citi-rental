-- Facebook page link beside the chat channels. Visitors open the page to see
-- reviews and follow; Messenger stays the chat link. The landing reviews link
-- and the business sameAs read it too.

alter table public.company_profile
  add column if not exists contact_facebook text
    check (contact_facebook is null or char_length(contact_facebook) <= 200);

comment on column public.company_profile.contact_facebook is
  'Facebook page link, username, or numeric page ID.';

grant select (contact_facebook) on public.company_profile to authenticated;
grant update (contact_facebook) on public.company_profile to authenticated;

-- The return type changes, so the function is recreated.
drop function public.get_public_contact_channels();

create function public.get_public_contact_channels()
returns table (
  phone text, whatsapp text, viber text, wechat text,
  kakaotalk text, line text, telegram text, messenger text, facebook text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.contact_phone, c.contact_whatsapp, c.contact_viber, c.contact_wechat,
    c.contact_kakaotalk, c.contact_line, c.contact_telegram, c.contact_messenger,
    c.contact_facebook
  from public.company_profile c
  limit 1;
$$;

revoke all on function public.get_public_contact_channels()
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_contact_channels()
  to anon, authenticated;
