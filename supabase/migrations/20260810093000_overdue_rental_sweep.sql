-- Automatic overdue marking for active rentals past their expected return.
--
-- APPLICATION_FEATURES.md requires rentals to be marked overdue automatically,
-- but nothing did it: `active` rentals stayed active forever and every overdue
-- count read zero. pg_cron is not enabled in this project (only btree_gist), so
-- the sweep is an org-scoped RPC invoked from ops page renders instead of a
-- scheduled job. For a small fleet the freshness difference is nil, and the
-- sweep stays inside the existing organization/role gates.

create index if not exists rentals_org_active_expected_return_idx
  on public.rentals (organization_id, expected_return_at)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- Sweep implementation
-- ---------------------------------------------------------------------------

create or replace function private.mark_overdue_rentals(
  p_organization_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  if p_organization_id is null then
    return 0;
  end if;

  -- Deliberately row-by-row, not a single bulk UPDATE. An active -> overdue
  -- update re-fires private.enforce_rental_booking_rules, which re-checks
  -- customers.is_blocked and the schedule. A customer blocked *after* pickup
  -- makes that one row raise, and in a bulk statement that would abort the
  -- whole sweep. Here a failing row is skipped and left active for staff to
  -- resolve; src/features/rentals/lib/overdue.ts still displays it as overdue.
  for v_id in
    select id
    from public.rentals
    where organization_id = p_organization_id
      and status = 'active'
      and expected_return_at < now()
    for update skip locked
  loop
    begin
      update public.rentals
      set status = 'overdue'
      where id = v_id
        and organization_id = p_organization_id
        and status = 'active';

      perform private.write_audit_log(
        p_organization_id,
        'rental.marked_overdue',
        'rental',
        v_id,
        jsonb_build_object('status', 'active'),
        jsonb_build_object('status', 'overdue'),
        jsonb_build_object('source', 'sweep')
      );

      v_count := v_count + 1;
    exception
      when others then
        -- Blocked customer or schedule conflict: leave the rental active.
        continue;
    end;
  end loop;

  return v_count;
end;
$$;

revoke all on function private.mark_overdue_rentals(uuid) from public;

-- Only `active` rentals are swept, never `reserved`: reserved -> overdue would
-- trip the tracking-consent gate for a car that never left the lot.

create or replace function public.sweep_overdue_rentals()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid := private.current_organization_id();
  v_role public.app_role := private.current_app_role();
begin
  if v_organization_id is null
    or v_role not in ('owner', 'admin', 'staff') then
    raise exception 'Staff access is required.' using errcode = 'insufficient_privilege';
  end if;

  return private.mark_overdue_rentals(v_organization_id);
end;
$$;

revoke all on function public.sweep_overdue_rentals() from public, anon;
grant execute on function public.sweep_overdue_rentals() to authenticated;
