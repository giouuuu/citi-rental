-- Mirror the Supabase Auth email onto profiles so ops can see who each
-- account is. auth.users stays the source of truth: the profile copy is
-- overwritten from it on every write, so clients cannot set it.

alter table public.profiles add column if not exists email text;

create or replace function private.profile_set_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.email := (select u.email from auth.users u where u.id = new.id);
  return new;
end;
$$;

drop trigger if exists profiles_set_email on public.profiles;
create trigger profiles_set_email
  before insert or update on public.profiles
  for each row execute function private.profile_set_email();

create or replace function private.auth_user_sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function private.auth_user_sync_profile_email();

-- Backfill without bumping updated_at: nobody edited these profiles.
alter table public.profiles disable trigger profiles_set_updated_at;
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and p.email is distinct from u.email;
alter table public.profiles enable trigger profiles_set_updated_at;
