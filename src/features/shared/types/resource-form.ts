import type {
  ActionResult,
  ResourceDefinition,
  ResourceReferences,
  ResourceRow,
} from "@/features/shared/types/resource";

export type ResourceFormProps = {
  definition: Pick<ResourceDefinition, "key" | "singular" | "fields">;
  row?: ResourceRow | null;
  references?: ResourceReferences;
  action: (
    formData: FormData,
  ) => Promise<ActionResult<{ id: string; href: string }>>;
  readOnly?: boolean;
};
