import { saveUserAction } from "@/features/users";
import { userDefinition } from "@/features/users";
import { ResourceCreateScreen } from "@/features/shared";
export default function Page() {
  return (
    <ResourceCreateScreen action={saveUserAction} definition={userDefinition} />
  );
}
