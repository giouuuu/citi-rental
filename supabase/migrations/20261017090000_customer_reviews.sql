-- Customer reviews shown on the public landing page.
--
-- Owners and admins copy reviews in from Facebook (or wherever renters left
-- them) on the Reviews page. A row is either a quote (reviewer name + text,
-- optionally with that renter's photo) or a photo on its own, such as a
-- handover picture. The landing page reads published rows through
-- list_public_customer_reviews(); the table itself is admin-only.

create table public.customer_reviews (
  id uuid primary key default gen_random_uuid(),
  reviewer_name text check (
    reviewer_name is null or char_length(trim(reviewer_name)) between 1 and 120
  ),
  body text check (body is null or char_length(trim(body)) between 1 and 2000),
  photo_url text check (photo_url is null or char_length(photo_url) <= 1000),
  -- The car in the photo or review, e.g. "Toyota Avanza". Free text.
  vehicle_label text check (
    vehicle_label is null or char_length(trim(vehicle_label)) between 1 and 120
  ),
  source text not null default 'facebook'
    check (source in ('facebook', 'google', 'direct', 'other')),
  reviewed_on date,
  is_hidden boolean not null default false,
  -- Lower shows first; ties go to the newest.
  sort_order integer not null default 0 check (sort_order between -10000 and 10000),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_reviews_quote_or_photo check (
    (reviewer_name is not null and body is not null) or photo_url is not null
  )
);

create index customer_reviews_listing_idx
  on public.customer_reviews (sort_order, created_at desc)
  where not is_hidden;
create index customer_reviews_created_by_idx on public.customer_reviews (created_by);

create trigger customer_reviews_set_updated_at
before update on public.customer_reviews
for each row execute function private.set_updated_at();

comment on table public.customer_reviews is
  'Renter reviews and photos for the landing page. Public reads go through list_public_customer_reviews().';

-- ---------------------------------------------------------------------------
-- RLS: owner and admin manage reviews.
-- ---------------------------------------------------------------------------
alter table public.customer_reviews enable row level security;
alter table public.customer_reviews force row level security;

revoke all on table public.customer_reviews from anon, authenticated;
grant select, insert, update, delete on table public.customer_reviews to authenticated;
grant all on table public.customer_reviews to service_role;

create policy customer_reviews_select_admin
on public.customer_reviews for select to authenticated
using ((select private.is_org_admin()));

create policy customer_reviews_insert_admin
on public.customer_reviews for insert to authenticated
with check ((select private.is_org_admin()));

create policy customer_reviews_update_admin
on public.customer_reviews for update to authenticated
using ((select private.is_org_admin()))
with check ((select private.is_org_admin()));

create policy customer_reviews_delete_admin
on public.customer_reviews for delete to authenticated
using ((select private.is_org_admin()));

-- ---------------------------------------------------------------------------
-- Public read: published reviews, only while the company shows its site.
-- ---------------------------------------------------------------------------
create function public.list_public_customer_reviews()
returns table (
  id uuid,
  reviewer_name text,
  body text,
  photo_url text,
  vehicle_label text,
  source text,
  reviewed_on date
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.reviewer_name, r.body, r.photo_url, r.vehicle_label, r.source, r.reviewed_on
  from public.customer_reviews r
  cross join public.company_profile o
  where o.is_active
    and o.show_on_public_site
    and not r.is_hidden
  order by r.sort_order asc, r.created_at desc
  limit 60;
$$;

revoke all on function public.list_public_customer_reviews()
  from public, anon, authenticated, service_role;
grant execute on function public.list_public_customer_reviews() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: public bucket for review photos uploaded from the Reviews page.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'review-photos',
  'review-photos',
  true,
  5242880,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists review_photos_public_select on storage.objects;
create policy review_photos_public_select
on storage.objects for select to public
using (bucket_id = 'review-photos');

drop policy if exists review_photos_insert_admin on storage.objects;
create policy review_photos_insert_admin
on storage.objects for insert to authenticated
with check (bucket_id = 'review-photos' and (select private.is_org_admin()));

drop policy if exists review_photos_delete_admin on storage.objects;
create policy review_photos_delete_admin
on storage.objects for delete to authenticated
using (bucket_id = 'review-photos' and (select private.is_org_admin()));

-- ---------------------------------------------------------------------------
-- Starter content: Facebook recommendations and handover photos the owner
-- shared. The photos ship with the site under /reviews/. They are not tied
-- to a named reviewer, so they go in as photo-only rows.
-- ---------------------------------------------------------------------------
insert into public.customer_reviews
  (reviewer_name, body, photo_url, vehicle_label, source, sort_order, created_by)
values
  ('Anne Abella Largadas', 'We had a fantastic experience renting from ZEKE''s Cebu Car rent at Happy Valley Vrama this week. The booking process online was straightforward, and pickup took less than 10 minutes, thanks to the efficient owner. The car Avanza was exceptionally clean, drove smoothly, and was great on gas. Returning the vehicle was equally hassle free. Thank you po for being so courteous and welcoming. Will definitely use your service again.', null, 'Toyota Avanza', 'facebook', 10, null),
  (null, null, '/reviews/renter-01.jpg', 'Toyota Vios', 'facebook', 20, null),
  ('Hanna Menchavez', 'Highly recommended car rental! The car was clean, well-maintained, and comfortable to use. The owner was also very accommodating and easy to communicate with. Highly recommended!', null, null, 'facebook', 30, null),
  ('Eulidiezy Marr', 'Owner is very accommodating and easy to transact with. The car is clean, well-maintained, and has good air conditioning, making the ride comfortable throughout. The booking process was smooth and hassle-free, and communication was clear from start to finish. I appreciate the professionalism and reliability of the service. Happy to have transacted with Zeke''s Cebu Car Rental and Services, and I would definitely recommend them to others.', null, null, 'facebook', 40, null),
  (null, null, '/reviews/renter-02.jpg', 'Toyota Avanza', 'facebook', 50, null),
  ('Marielle Cruz', 'Fast transaction, way libog, ang car kay very limpyo and new nindot kaayo, I recommend saur much!!!', null, null, 'facebook', 60, null),
  ('Glynth Lu', 'Owner was very accommodating and very flexible with his terms. The service is very good and the car units are in their excellent conditions. I highly recommend this renter 💯', null, null, 'facebook', 70, null),
  (null, null, '/reviews/renter-04.jpg', 'Toyota Vios', 'facebook', 80, null),
  ('Jhonas Gray', 'I would like to commend Zeke''s Cebu Car Rental for a smooth transaction and for the professionalism and trust shown by the owner in entrusting the unit to me. Highly recommended!', null, null, 'facebook', 90, null),
  ('Reign Gallano', 'The owner was very responsive. We used the car for 6 days and had a great experience. Highly recommended!', null, null, 'facebook', 100, null),
  (null, null, '/reviews/renter-05.jpg', 'Toyota Avanza', 'facebook', 110, null),
  ('Elyn Garcia Salaya', 'They are very accommodating! And the car was good! And the price was reasonable and very affordable.', null, null, 'facebook', 120, null),
  ('Ton Ton', 'Great cars and owner is very accommodating.', null, null, 'facebook', 130, null),
  (null, null, '/reviews/renter-03.jpg', 'Toyota Avanza', 'facebook', 140, null),
  (null, null, '/reviews/renter-07.jpg', 'Toyota Vios', 'facebook', 150, null),
  (null, null, '/reviews/renter-06.jpg', 'Toyota Avanza', 'facebook', 160, null),
  (null, null, '/reviews/renter-08.jpg', 'Toyota Avanza', 'facebook', 170, null),
  (null, null, '/reviews/renter-09.jpg', 'Toyota Vios', 'facebook', 180, null);
