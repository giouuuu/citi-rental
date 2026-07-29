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
          sort: "organization_id",
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
});
