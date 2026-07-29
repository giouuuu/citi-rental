import { describe, expect, it } from "vitest";

import {
  ADMIN_ROLES,
  APP_ROLES,
  STAFF_ROLES,
  isAdminRole,
  isStaffRole,
} from "./app-roles";

describe("app roles", () => {
  it("exposes the four application roles", () => {
    expect(APP_ROLES).toEqual(["owner", "staff", "admin", "customer"]);
  });

  it("treats owner and admin as admin roles", () => {
    expect(ADMIN_ROLES).toEqual(["owner", "admin"]);
    expect(isAdminRole("owner")).toBe(true);
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("staff")).toBe(false);
    expect(isAdminRole("customer")).toBe(false);
  });

  it("treats owner, admin, and staff as staff roles", () => {
    expect(STAFF_ROLES).toEqual(["owner", "admin", "staff"]);
    expect(isStaffRole("staff")).toBe(true);
    expect(isStaffRole("customer")).toBe(false);
  });
});
