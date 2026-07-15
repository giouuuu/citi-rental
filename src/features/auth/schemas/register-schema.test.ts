import { describe, expect, it } from "vitest";

import { registerSchema } from "./register-schema";

const validRegistration = {
  fullName: "Alex Rivera",
  organizationName: "Northline Rentals",
  email: "alex@example.com",
  password: "fleetpass1",
  confirmPassword: "fleetpass1",
};

describe("registerSchema", () => {
  it("normalizes valid registration details", () => {
    const result = registerSchema.parse({
      ...validRegistration,
      email: "  ALEX@EXAMPLE.COM ",
    });

    expect(result.email).toBe("alex@example.com");
  });

  it("places password mismatch errors on the confirmation field", () => {
    const result = registerSchema.safeParse({
      ...validRegistration,
      confirmPassword: "different1",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.confirmPassword).toContain(
        "Passwords do not match.",
      );
    }
  });

  it("requires a password with a letter and number", () => {
    const result = registerSchema.safeParse({
      ...validRegistration,
      password: "passwordonly",
      confirmPassword: "passwordonly",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.password).toContain(
        "Password must contain at least one number.",
      );
    }
  });
});
