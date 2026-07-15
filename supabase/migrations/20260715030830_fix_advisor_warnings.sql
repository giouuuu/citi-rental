-- Resolve live Supabase security and performance advisor warnings.

-- This event-trigger helper is invoked by PostgreSQL itself and must not be an
-- API-callable SECURITY DEFINER function.
revoke execute on function public.rls_auto_enable()
  from public, anon, authenticated, service_role;

-- Keep the organization-wide SELECT policies as the only read policies. Split
-- mutation access by command so write policies do not also run for SELECT.
do $$
declare
  v_table text;
  v_predicate text :=
    'organization_id = (select private.current_organization_id()) '
    || 'and (select private.current_app_role()) = ''administrator''';
begin
  foreach v_table in array array[
    'vehicles', 'gps_devices', 'geofences', 'vehicle_geofences'
  ] loop
    execute format('drop policy if exists %I on public.%I',
      v_table || '_write_admin', v_table);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (%s)',
      v_table || '_insert_admin', v_table, v_predicate
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
      v_table || '_update_admin', v_table, v_predicate, v_predicate
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (%s)',
      v_table || '_delete_admin', v_table, v_predicate
    );
  end loop;
end
$$;

do $$
declare
  v_table text;
  v_predicate text :=
    'organization_id = (select private.current_organization_id()) '
    || 'and (select private.current_app_role()) in (''administrator'', ''rental_staff'')';
begin
  foreach v_table in array array['customers', 'rentals', 'rental_geofences'] loop
    execute format('drop policy if exists %I on public.%I',
      v_table || '_write_staff', v_table);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (%s)',
      v_table || '_insert_staff', v_table, v_predicate
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
      v_table || '_update_staff', v_table, v_predicate, v_predicate
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (%s)',
      v_table || '_delete_staff', v_table, v_predicate
    );
  end loop;
end
$$;

drop policy if exists notification_preferences_write
  on public.notification_preferences;
create policy notification_preferences_insert
on public.notification_preferences for insert to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and (
    profile_id = (select auth.uid())
    or (select private.current_app_role()) = 'administrator'
  )
);
create policy notification_preferences_update
on public.notification_preferences for update to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (
    profile_id = (select auth.uid())
    or (select private.current_app_role()) = 'administrator'
  )
)
with check (
  organization_id = (select private.current_organization_id())
  and (
    profile_id = (select auth.uid())
    or (select private.current_app_role()) = 'administrator'
  )
);
create policy notification_preferences_delete
on public.notification_preferences for delete to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (
    profile_id = (select auth.uid())
    or (select private.current_app_role()) = 'administrator'
  )
);

drop policy if exists app_settings_write_admin on public.app_settings;
create policy app_settings_insert_admin
on public.app_settings for insert to authenticated
with check (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) = 'administrator'
);
create policy app_settings_update_admin
on public.app_settings for update to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) = 'administrator'
)
with check (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) = 'administrator'
);
create policy app_settings_delete_admin
on public.app_settings for delete to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (select private.current_app_role()) = 'administrator'
);
