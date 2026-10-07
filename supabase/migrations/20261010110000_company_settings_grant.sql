-- ---------------------------------------------------------------------------
-- Settings could not be saved: "permission denied for function
-- update_company_settings_impl".
--
-- public.update_company_settings is a security-invoker SQL wrapper, so the
-- caller needs EXECUTE on the private implementation it calls.
-- single_tenant_drop_organizations revoked that from authenticated and never
-- granted it back. The implementation is security definer and refuses anyone
-- who is not an active owner or admin (private.is_org_admin), the same shape
-- as private.transition_rental_impl.
-- ---------------------------------------------------------------------------
grant execute on function private.update_company_settings_impl(
  text, text, integer, integer, integer, text
) to authenticated;
