-- After a rental is completed the renter sees a thank-you note and buttons to
-- review the business on Google and Facebook. The owner sets where those
-- buttons go and what the note says in Settings.

alter table public.company_profile
  add column if not exists review_google_url text
    check (review_google_url is null or char_length(review_google_url) <= 500),
  add column if not exists review_facebook_url text
    check (review_facebook_url is null or char_length(review_facebook_url) <= 500),
  add column if not exists review_thank_you_message text
    check (review_thank_you_message is null or char_length(review_thank_you_message) <= 1000);

comment on column public.company_profile.review_google_url is
  'Google review link the completed-rental page sends renters to (Google Business "Ask for reviews" link).';
comment on column public.company_profile.review_facebook_url is
  'Facebook review link for completed rentals. Empty falls back to the Facebook page''s reviews tab.';
comment on column public.company_profile.review_thank_you_message is
  'Thank-you note shown to the renter once a rental is completed.';

grant select (review_google_url, review_facebook_url, review_thank_you_message)
  on public.company_profile to authenticated;
grant update (review_google_url, review_facebook_url, review_thank_you_message)
  on public.company_profile to authenticated;

-- Renters cannot read company_profile; this returns only the review settings.
create function public.get_public_review_links()
returns table (google text, facebook text, thank_you text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    nullif(btrim(c.review_google_url), ''),
    nullif(btrim(c.review_facebook_url), ''),
    nullif(btrim(c.review_thank_you_message), '')
  from public.company_profile c
  limit 1;
$$;

revoke all on function public.get_public_review_links()
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_review_links()
  to anon, authenticated;
