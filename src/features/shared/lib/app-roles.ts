export type AppRole = "owner" | "staff" | "admin" | "customer";

export const APP_ROLES: AppRole[] = ["owner", "staff", "admin", "customer"];

/** Roles that can enter the protected ops app and manage org-wide settings/assets. */
export const ADMIN_ROLES: AppRole[] = ["owner", "admin"];

/** Roles with operational write access in actions/RLS (not the same as protected-route access). */
export const STAFF_ROLES: AppRole[] = ["owner", "admin", "staff"];

export function isAdminRole(role: string | null | undefined): boolean {
  return ADMIN_ROLES.includes(role as AppRole);
}

export function isStaffRole(role: string | null | undefined): boolean {
  return STAFF_ROLES.includes(role as AppRole);
}
