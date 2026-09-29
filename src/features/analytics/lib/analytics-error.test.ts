import { describe, expect, it } from "vitest";

import { analyticsErrorMessage, describeError } from "./analytics-error";

describe("analyticsErrorMessage", () => {
  it("explains a permission failure", () => {
    expect(analyticsErrorMessage({ code: "42501" })).toMatch(/owners and admins/);
  });

  it("points at the migration when the RPC is missing", () => {
    expect(analyticsErrorMessage({ code: "PGRST202", message: "not found" })).toMatch(/migration/);
  });

  it("falls back to a generic retry message", () => {
    expect(analyticsErrorMessage(new Error("boom"))).toMatch(/Reload/);
  });
});

describe("describeError", () => {
  it("reads a PostgrestError-like message", () => {
    expect(describeError({ message: "relation missing" })).toBe("relation missing");
  });
});
