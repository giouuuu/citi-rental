import { z } from "zod";
import { requiredText } from "@/features/shared/schemas/schema-helpers";
import type { ResourceDefinition } from "@/features/shared/types/resource";

export const userDefinition: ResourceDefinition = {
  key: "user",
  table: "profiles",
  singular: "Staff profile",
  plural: "Staff users",
  route: "/settings/users",
  titleField: "full_name",
  subtitleField: "role",
  searchColumn: "full_name",
  description:
    "Assign staff roles and disable application access. Authentication identities remain managed by Supabase Auth.",
  writeRoles: ["owner", "admin"],
  archive: { field: "is_active", value: false, label: "Disable access" },
  schema: z.object({
    id: z.uuid("Enter the Supabase Auth user ID."),
    full_name: requiredText("Full name", 120),
    role: z.enum(["owner", "staff", "admin", "customer"]),
    is_active: z.boolean(),
  }),
  fields: [
    {
      name: "id",
      label: "Supabase Auth user ID",
      required: true,
      description:
        "Create or invite the authentication user first, then paste its UUID here.",
    },
    { name: "full_name", label: "Full name", required: true },
    {
      name: "role",
      label: "Role",
      type: "select",
      required: true,
      options: [
        { value: "owner", label: "Owner" },
        { value: "admin", label: "Admin" },
        { value: "staff", label: "Staff" },
        { value: "customer", label: "Customer" },
      ],
    },
    {
      name: "is_active",
      label: "User has application access",
      type: "checkbox",
    },
  ],
  columns: [
    { key: "full_name", label: "Name" },
    { key: "role", label: "Role", format: "status" },
    { key: "is_active", label: "Active", format: "boolean" },
    { key: "updated_at", label: "Updated", format: "datetime" },
  ],
  demoRows: [
    {
      id: "00000000-0000-0000-0000-000000000001",
      full_name: "Alex Rivera",
      role: "admin",
      is_active: true,
      updated_at: "2026-07-15T00:00:00Z",
    },
  ],
};
