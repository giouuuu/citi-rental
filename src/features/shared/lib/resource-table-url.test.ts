import { describe, expect, it } from "vitest";

import {
  resolveFallbackSort,
  resourceTableUrl,
} from "@/features/shared/lib/resource-table-url";
import type { ResourceQuery } from "@/features/shared/types/resource";

const baseQuery: ResourceQuery = {
  q: "",
  page: 1,
  pageSize: 20,
  sort: "updated_at",
  direction: "desc",
};

describe("resolveFallbackSort", () => {
  it("prefers updated_at when the resource has it", () => {
    expect(
      resolveFallbackSort([{ key: "name", label: "Name" }, { key: "updated_at", label: "Updated" }]),
    ).toBe("updated_at");
  });

  it("falls back to the first column, then to id", () => {
    expect(resolveFallbackSort([{ key: "name", label: "Name" }])).toBe("name");
    expect(resolveFallbackSort([])).toBe("id");
  });
});

describe("resourceTableUrl", () => {
  it("omits every param that is already the default", () => {
    expect(resourceTableUrl("/vehicles", baseQuery, {}, "updated_at")).toBe(
      "/vehicles",
    );
  });

  it("emits only the params that differ from the defaults", () => {
    expect(
      resourceTableUrl("/vehicles", baseQuery, { q: "honda" }, "updated_at"),
    ).toBe("/vehicles?q=honda");
    expect(
      resourceTableUrl("/vehicles", baseQuery, { direction: "asc" }, "updated_at"),
    ).toBe("/vehicles?direction=asc");
    expect(
      resourceTableUrl("/vehicles", baseQuery, { pageSize: 50 }, "updated_at"),
    ).toBe("/vehicles?page_size=50");
  });

  it("keeps sort when it differs from the resource fallback", () => {
    expect(
      resourceTableUrl("/vehicles", baseQuery, { sort: "name" }, "updated_at"),
    ).toBe("/vehicles?sort=name");
  });

  it("resets to page 1 when the query changes", () => {
    const onPageFour = { ...baseQuery, page: 4 };
    expect(
      resourceTableUrl("/vehicles", onPageFour, { q: "honda" }, "updated_at"),
    ).toBe("/vehicles?q=honda");
  });

  it("resets to page 1 when sort or direction changes", () => {
    const onPageFour = { ...baseQuery, page: 4 };
    expect(
      resourceTableUrl("/vehicles", onPageFour, { sort: "name" }, "updated_at"),
    ).toBe("/vehicles?sort=name");
    expect(
      resourceTableUrl("/vehicles", onPageFour, { direction: "asc" }, "updated_at"),
    ).toBe("/vehicles?direction=asc");
  });

  it("does not reset when the page is changed explicitly", () => {
    const searching = { ...baseQuery, q: "honda", page: 2 };
    expect(
      resourceTableUrl("/vehicles", searching, { page: 3 }, "updated_at"),
    ).toBe("/vehicles?q=honda&page=3");
  });

  it("does not reset when a param is set to the value it already has", () => {
    const searching = { ...baseQuery, q: "honda", page: 3 };
    expect(
      resourceTableUrl("/vehicles", searching, { q: "honda" }, "updated_at"),
    ).toBe("/vehicles?q=honda&page=3");
  });

  it("encodes characters that would otherwise break the query string", () => {
    expect(
      resourceTableUrl("/vehicles", baseQuery, { q: "a&b c+d%e" }, "updated_at"),
    ).toBe("/vehicles?q=a%26b+c%2Bd%25e");
  });

  it("treats clearing the query as a change that resets paging", () => {
    const searching = { ...baseQuery, q: "honda", page: 5 };
    expect(resourceTableUrl("/vehicles", searching, { q: "" }, "updated_at")).toBe(
      "/vehicles",
    );
  });
});
