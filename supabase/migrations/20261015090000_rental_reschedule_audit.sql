-- ===========================================================================
-- Rental timeline: log pickup/return date changes.
--
-- Status changes, inspections and overdue marks already write audit_logs;
-- payments carry their own timestamps. Moving a rental's dates left no trace,
-- whether staff edited a booking before pickup or extended an active one
-- (extend_rental only leaves a payment row when it charges for the time).
--
-- One trigger covers both paths: any change to start_at or expected_return_at
-- writes 'rental.rescheduled' with the old and new dates. The status at the
-- time goes in metadata so the timeline can call an active/overdue move an
-- extension.
-- ===========================================================================

create function private.log_rental_reschedule()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform private.write_audit_log(
    'rental.rescheduled',
    'rental',
    new.id,
    jsonb_build_object(
      'start_at', old.start_at,
      'expected_return_at', old.expected_return_at
    ),
    jsonb_build_object(
      'start_at', new.start_at,
      'expected_return_at', new.expected_return_at
    ),
    jsonb_build_object('status', old.status)
  );
  return null;
end;
$function$;

revoke all on function private.log_rental_reschedule()
  from public, anon, authenticated, service_role;

create trigger rentals_log_reschedule
after update of start_at, expected_return_at on public.rentals
for each row
when (
  old.start_at is distinct from new.start_at
  or old.expected_return_at is distinct from new.expected_return_at
)
execute function private.log_rental_reschedule();
