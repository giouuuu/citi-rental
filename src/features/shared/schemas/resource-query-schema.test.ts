import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseResourceQuery } from "./resource-query-schema";
import type { ResourceDefinition } from "../types/resource";

const definition: ResourceDefinition = {
  key: "item",
  table: "items",
  singular: "Item",
  plural: "Items",
  route: "/items",
  titleField: "name",
  searchColumn: "name",
  description: "Items",
  fields: [],
  columns: [
    { key: "name", label: "Name" },
    { key: "updated_at", label: "Updated" },
  ],
  schema: z.object({}),
  writeRoles: ["owner", "admin"],
};

describe("parseResourceQuery", () => {
  it("bounds pagination and rejects unknown sort columns", () => {
    expect(
      parseResourceQuery(
        {
          page: "-3",
          page_size: "500",
          sort: "plate_number",
          q: "  fleet  ",
        },
        definition,
      ),
    ).toEqual({
      q: "fleet",
      page: 1,
      pageSize: 20,
      sort: "updated_at",
      direction: "desc",
    });
  });

  it("accepts a valid table state", () => {
    expect(
      parseResourceQuery(
        { page: "2", page_size: "50", sort: "name", direction: "asc" },
        definition,
      ),
    ).toMatchObject({ page: 2, pageSize: 50, sort: "name", direction: "asc" });
  });

  it("keeps only declared URL filters with safe values", () => {
    const filtered: ResourceDefinition = {
      ...definition,
      filters: [
        { param: "category", column: "category_id", op: "eq", label: "Category" },
        { param: "from", column: "expense_date", op: "gte", label: "From" },
      ],
    };
    expect(
      parseResourceQuery(
        { category: "6f1c2c4e-0000-4000-8000-000000000001", from: "2026-03-01", other: "x" },
        filtered,
      ).filters,
    ).toEqual({ category: "6f1c2c4e-0000-4000-8000-000000000001", from: "2026-03-01" });
    expect(parseResourceQuery({ category: "a,b);drop" }, filtered).filters).toBeUndefined();
    expect(parseResourceQuery({ category: "x" }, definition).filters).toBeUndefined();
  });
});
