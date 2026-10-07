-- Chat channels the landing page offers visitors.
--
-- Most renters are foreign tourists who message on their home app rather than
-- call: Koreans on KakaoTalk, Chinese on WeChat, Japanese/Thai/Taiwanese on
-- LINE, most others on WhatsApp, Viber or Messenger. The owner fills in the
-- ones they use in Settings; an empty channel is hidden from the site.
--
-- company_profile is closed to anon, so the storefront reads these through
-- get_public_contact_channels(), which returns nothing else from the row.

alter table public.company_profile
  add column contact_phone text,
  add column contact_whatsapp text,
  add column contact_viber text,
  add column contact_wechat text,
  add column contact_kakaotalk text,
  add column contact_line text,
  add column contact_telegram text,
  add column contact_messenger text;

comment on column public.company_profile.contact_phone is
  'Phone number for calls, international format (+63...). Shown on the landing contact button.';
comment on column public.company_profile.contact_whatsapp is
  'WhatsApp number, international format (+63...).';
comment on column public.company_profile.contact_viber is
  'Viber number, international format (+63...).';
comment on column public.company_profile.contact_wechat is
  'WeChat ID. WeChat has no add-contact link, so the site offers it to copy.';
comment on column public.company_profile.contact_kakaotalk is
  'KakaoTalk open-chat link (https://open.kakao.com/...) or Kakao ID to copy.';
comment on column public.company_profile.contact_line is
  'LINE ID (@official or personal) or a line.me link.';
comment on column public.company_profile.contact_telegram is
  'Telegram username, without the @.';
comment on column public.company_profile.contact_messenger is
  'Facebook page username for m.me links.';

create function public.get_public_contact_channels()
returns table (
  phone text, whatsapp text, viber text, wechat text,
  kakaotalk text, line text, telegram text, messenger text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.contact_phone, c.contact_whatsapp, c.contact_viber, c.contact_wechat,
    c.contact_kakaotalk, c.contact_line, c.contact_telegram, c.contact_messenger
  from public.company_profile c
  limit 1;
$$;

revoke all on function public.get_public_contact_channels()
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_contact_channels()
  to anon, authenticated;
